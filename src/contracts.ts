import { ethers, Contract, Wallet, Provider, formatUnits, parseUnits } from 'ethers';
import { config } from './config';
import { logger } from './utils/logger';

// ABI imports
import X2SwapABI from '../abi/X2Swap.json';
import X2PoolABI from '../abi/X2Pool.json';
import ERC20ABI from '../abi/ERC20.json';
import ScopedVaultABI from '../abi/ScopedVault.json';

export interface PositionInfo {
  id: bigint;
  sender: string;
  openAssetAmount: bigint;
  targetAmount: bigint;
  openDate: bigint;
  expireDate: bigint;
  profitSharing: bigint;
  closeDate: bigint;
  closeAssetAmount: bigint;
}

export interface PositionCheck {
  profit: boolean;
  borrowerAmount: bigint;
  poolAmount: bigint;
  feeAmount: bigint;
  assetAmountOut: bigint;
}

export class X2SwapClient {
  readonly provider: Provider;
  readonly signer: Wallet;
  readonly x2swapWeth: Contract;
  readonly x2swapWbtc: Contract;
  readonly x2pool: Contract;
  readonly usdc: Contract;
  readonly vault: Contract | null;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new Wallet(config.privateKey, this.provider);

    this.x2swapWeth = new Contract(config.contracts.x2swapWeth, X2SwapABI, this.signer);
    this.x2swapWbtc = new Contract(config.contracts.x2swapWbtc, X2SwapABI, this.signer);
    this.x2pool = new Contract(config.contracts.x2pool, X2PoolABI, this.signer);
    this.usdc = new Contract(config.contracts.usdc, ERC20ABI, this.signer);

    this.vault = config.contracts.scopedVault
      ? new Contract(config.contracts.scopedVault, ScopedVaultABI, this.signer)
      : null;
  }

  get address(): string {
    return this.signer.address;
  }

  private getX2Swap(asset: 'eth' | 'btc'): Contract {
    return asset === 'eth' ? this.x2swapWeth : this.x2swapWbtc;
  }

  // ── Position Management ──────────────────────────────────────────

  async openPosition(
    asset: 'eth' | 'btc',
    usdcAmount: number,
    swapPath: string,
    maxDeviationBps = config.maxSlippageBps
  ): Promise<bigint> {
    const contract = this.getX2Swap(asset);
    const amount = parseUnits(usdcAmount.toString(), 6);
    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min

    // Approve USDC spend
    const allowance = await this.usdc.allowance(this.address, await contract.getAddress());
    if (allowance < amount) {
      logger.info(`Approving USDC for ${asset} X2Swap...`);
      const approveTx = await this.usdc.approve(await contract.getAddress(), ethers.MaxUint256);
      await approveTx.wait();
    }

    logger.info(`Opening ${asset.toUpperCase()} position: ${usdcAmount} USDC`);
    const tx = await contract.openPosition(
      amount,
      maxDeviationBps,
      config.contracts.uniswapRouter,
      swapPath,
      deadline
    );
    const receipt = await tx.wait();
    logger.info(`Position opened, tx: ${receipt.hash}`);

    // Get position ID from the latest position
    const positions = await this.getPositions(asset);
    return positions[positions.length - 1];
  }

  async closePosition(
    asset: 'eth' | 'btc',
    positionId: bigint,
    swapPath: string,
    maxDeviationBps = config.maxSlippageBps
  ): Promise<void> {
    const contract = this.getX2Swap(asset);
    const deadline = Math.floor(Date.now() / 1000) + 300;

    logger.info(`Closing ${asset.toUpperCase()} position #${positionId}`);
    const tx = await contract.closePosition(
      positionId,
      maxDeviationBps,
      config.contracts.uniswapRouter,
      swapPath,
      deadline
    );
    const receipt = await tx.wait();
    logger.info(`Position closed, tx: ${receipt.hash}`);
  }

  async checkPosition(
    asset: 'eth' | 'btc',
    positionId: bigint,
    swapPath: string
  ): Promise<PositionCheck> {
    const contract = this.getX2Swap(asset);
    const result = await contract.checkPosition(
      positionId,
      config.contracts.uniswapRouter,
      swapPath
    );
    return {
      profit: result[0],
      borrowerAmount: result[1],
      poolAmount: result[2],
      feeAmount: result[3],
      assetAmountOut: result[4],
    };
  }

  async getPositionInfo(asset: 'eth' | 'btc', positionId: bigint): Promise<PositionInfo> {
    const contract = this.getX2Swap(asset);
    const p = await contract.positions(positionId);
    return {
      id: p[0],
      sender: p[1],
      openAssetAmount: p[2],
      targetAmount: p[3],
      openDate: p[4],
      expireDate: p[5],
      profitSharing: p[6],
      closeDate: p[7],
      closeAssetAmount: p[8],
    };
  }

  async getPositions(asset: 'eth' | 'btc'): Promise<bigint[]> {
    const contract = this.getX2Swap(asset);
    return await contract.getPositionsOf(this.address);
  }

  // ── Protocol Info ────────────────────────────────────────────────

  async getProtocolInfo(asset: 'eth' | 'btc') {
    const contract = this.getX2Swap(asset);
    const [profitSharing, targetRate, feeBps, duration] = await Promise.all([
      contract.currentProfitSharing(),
      contract.targetRate(),
      contract.feeBps(),
      contract.positionDuration(),
    ]);
    return {
      profitSharing: Number(profitSharing),
      targetRate: formatUnits(targetRate, 6),
      feeBps: Number(feeBps),
      positionDurationDays: Number(duration) / 86400,
    };
  }

  // ── LP Management ───────────────────────────────────────────────

  async depositToPool(usdcAmount: number): Promise<bigint> {
    const amount = parseUnits(usdcAmount.toString(), 6);

    const allowance = await this.usdc.allowance(this.address, config.contracts.x2pool);
    if (allowance < amount) {
      const approveTx = await this.usdc.approve(config.contracts.x2pool, ethers.MaxUint256);
      await approveTx.wait();
    }

    logger.info(`Depositing ${usdcAmount} USDC to X2Pool`);
    const tx = await this.x2pool.deposit(amount, this.address);
    const receipt = await tx.wait();
    logger.info(`Pool deposit done, tx: ${receipt.hash}`);

    return await this.x2pool.balanceOf(this.address);
  }

  async withdrawFromPool(usdcAmount: number): Promise<void> {
    const amount = parseUnits(usdcAmount.toString(), 6);
    logger.info(`Withdrawing ${usdcAmount} USDC from X2Pool`);
    const tx = await this.x2pool.withdraw(amount, this.address, this.address);
    await tx.wait();
  }

  async getPoolInfo() {
    const [totalAssets, shares, balance] = await Promise.all([
      this.x2pool.totalAssets(),
      this.x2pool.balanceOf(this.address),
      this.usdc.balanceOf(this.address),
    ]);
    const assetsOwned = shares > 0n ? await this.x2pool.convertToAssets(shares) : 0n;
    return {
      totalPoolAssets: formatUnits(totalAssets, 6),
      myShares: formatUnits(shares, 18),
      myAssetsInPool: formatUnits(assetsOwned, 6),
      walletUsdc: formatUnits(balance, 6),
    };
  }

  // ── Vault Management ────────────────────────────────────────────

  async getVaultInfo() {
    if (!this.vault) return null;
    const [maxPerTrade, maxTotal, exposure, timeWindow, agent] = await Promise.all([
      this.vault.maxPerTrade(),
      this.vault.maxTotalExposure(),
      this.vault.currentExposure(),
      this.vault.timeWindow(),
      this.vault.agent(),
    ]);
    return {
      maxPerTrade: formatUnits(maxPerTrade, 6),
      maxTotalExposure: formatUnits(maxTotal, 6),
      currentExposure: formatUnits(exposure, 6),
      timeWindowHours: Number(timeWindow) / 3600,
      agent,
    };
  }
}
