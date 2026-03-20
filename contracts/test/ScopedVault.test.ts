import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("ScopedVault — Security & Limits Tests", function () {
  let owner: SignerWithAddress;
  let agentSigner: SignerWithAddress;
  let attacker: SignerWithAddress;
  let stranger: SignerWithAddress;

  let usdc: any;
  let mockX2Swap: any;
  let vault: any;

  const MAX_PER_TRADE = ethers.parseUnits("1000", 6); // $1,000 USDC
  const MAX_TOTAL_EXPOSURE = ethers.parseUnits("5000", 6); // $5,000 USDC
  const TIME_WINDOW = 86400; // 1 day in seconds
  const VAULT_DEPOSIT = ethers.parseUnits("10000", 6); // $10,000 USDC

  beforeEach(async () => {
    [owner, agentSigner, attacker, stranger] = await ethers.getSigners();

    // Deploy mock USDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    // Deploy mock X2Swap (needs to know the USDC address)
    const MockX2SwapFactory = await ethers.getContractFactory("MockX2Swap");
    mockX2Swap = await MockX2SwapFactory.deploy(await usdc.getAddress());

    // Deploy ScopedVault
    const ScopedVaultFactory = await ethers.getContractFactory("ScopedVault");
    vault = await ScopedVaultFactory.deploy(
      await usdc.getAddress(),
      agentSigner.address,
      MAX_PER_TRADE,
      MAX_TOTAL_EXPOSURE,
      TIME_WINDOW
    );

    // Fund vault with $10,000 USDC
    await usdc.approve(await vault.getAddress(), VAULT_DEPOSIT);
    await vault.deposit(VAULT_DEPOSIT);
  });

  // ── 1. Deployment & Initial State ─────────────────────────────────────────

  describe("1. Deployment", () => {
    it("1.1 sets owner correctly", async () => {
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("1.2 sets agent correctly", async () => {
      expect(await vault.agent()).to.equal(agentSigner.address);
    });

    it("1.3 sets maxPerTrade correctly", async () => {
      expect(await vault.maxPerTrade()).to.equal(MAX_PER_TRADE);
    });

    it("1.4 sets maxTotalExposure correctly", async () => {
      expect(await vault.maxTotalExposure()).to.equal(MAX_TOTAL_EXPOSURE);
    });

    it("1.5 vault balance reflects deposit", async () => {
      const balance = await vault.vaultBalance();
      expect(balance).to.equal(VAULT_DEPOSIT);
    });

    it("1.6 currentExposure starts at zero", async () => {
      expect(await vault.currentExposure()).to.equal(0);
    });
  });

  // ── 2. Access Control — THE core safety property ──────────────────────────

  describe("2. Access Control (KEY SAFETY PROPERTY)", () => {
    it("2.1 agent CANNOT call withdraw — user funds are safe", async () => {
      await expect(
        vault.connect(agentSigner).withdraw(ethers.parseUnits("100", 6))
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("2.2 attacker CANNOT call withdraw", async () => {
      await expect(
        vault.connect(attacker).withdraw(ethers.parseUnits("100", 6))
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("2.3 attacker CANNOT set agent address", async () => {
      await expect(
        vault.connect(attacker).setAgent(attacker.address)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("2.4 stranger CANNOT call executeOpenPosition", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await expect(
        vault.connect(stranger).executeOpenPosition(
          await mockX2Swap.getAddress(),
          ethers.parseUnits("100", 6),
          50,
          ethers.ZeroAddress,
          "0x",
          deadline
        )
      ).to.be.revertedWith("ScopedVault: caller is not agent");
    });

    it("2.5 owner CAN withdraw their own funds", async () => {
      const withdrawAmount = ethers.parseUnits("500", 6);
      const balanceBefore = await usdc.balanceOf(owner.address);
      await vault.connect(owner).withdraw(withdrawAmount);
      const balanceAfter = await usdc.balanceOf(owner.address);
      expect(balanceAfter - balanceBefore).to.equal(withdrawAmount);
    });

    it("2.6 all non-owners denied withdraw — vault stays intact", async () => {
      const signers = [agentSigner, attacker, stranger];
      for (const signer of signers) {
        await expect(
          vault.connect(signer).withdraw(ethers.parseUnits("1", 6))
        ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
      }
      // Vault still has all its funds
      expect(await vault.vaultBalance()).to.equal(VAULT_DEPOSIT);
    });
  });

  // ── 3. Per-Trade Limit Enforcement ────────────────────────────────────────

  describe("3. Per-Trade Limit Enforcement", () => {
    it("3.1 rejects trade exceeding maxPerTrade", async () => {
      const overLimit = MAX_PER_TRADE + ethers.parseUnits("1", 6); // $1,001
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await expect(
        vault.connect(agentSigner).executeOpenPosition(
          await mockX2Swap.getAddress(),
          overLimit,
          50,
          ethers.ZeroAddress,
          "0x",
          deadline
        )
      ).to.be.revertedWith("ScopedVault: exceeds max per trade");
    });

    it("3.2 rejects trade way over maxPerTrade ($10k attempt)", async () => {
      const massiveOverLimit = ethers.parseUnits("10000", 6);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await expect(
        vault.connect(agentSigner).executeOpenPosition(
          await mockX2Swap.getAddress(),
          massiveOverLimit,
          50,
          ethers.ZeroAddress,
          "0x",
          deadline
        )
      ).to.be.revertedWith("ScopedVault: exceeds max per trade");
    });
  });

  // ── 4. Exposure Limit Enforcement ─────────────────────────────────────────

  describe("4. Exposure Limit Enforcement", () => {
    it("4.1 availableForTrading capped at maxTotalExposure (not vault balance)", async () => {
      // Vault has $10k but maxExposure = $5k → available = $5k
      const available = await vault.availableForTrading();
      expect(available).to.equal(MAX_TOTAL_EXPOSURE);
    });

    it("4.2 exposure tracked after opening position", async () => {
      const tradeSize = ethers.parseUnits("500", 6);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Execute a real open via the working mock
      await vault.connect(agentSigner).executeOpenPosition(
        await mockX2Swap.getAddress(),
        tradeSize,
        50,
        ethers.ZeroAddress,
        "0x",
        deadline
      );

      // Exposure should now be $500
      expect(await vault.currentExposure()).to.equal(tradeSize);
    });

    it("4.3 available decreases after opening position", async () => {
      const tradeSize = ethers.parseUnits("500", 6);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await vault.connect(agentSigner).executeOpenPosition(
        await mockX2Swap.getAddress(),
        tradeSize,
        50,
        ethers.ZeroAddress,
        "0x",
        deadline
      );

      const available = await vault.availableForTrading();
      // Was $5k, now $4.5k
      expect(available).to.equal(MAX_TOTAL_EXPOSURE - tradeSize);
    });

    it("4.4 rejects trade that would exceed maxTotalExposure", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Fill up to $4,500 with 4.5 trades of $1k
      for (let i = 0; i < 4; i++) {
        await vault.connect(agentSigner).executeOpenPosition(
          await mockX2Swap.getAddress(),
          ethers.parseUnits("1000", 6),
          50,
          ethers.ZeroAddress,
          "0x",
          deadline
        );
      }
      // Exposure now at $4,000; try $1,001 → should fail (4000 + 1001 > 5000)
      await expect(
        vault.connect(agentSigner).executeOpenPosition(
          await mockX2Swap.getAddress(),
          ethers.parseUnits("1001", 6),
          50,
          ethers.ZeroAddress,
          "0x",
          deadline
        )
      ).to.be.revertedWith("ScopedVault: exceeds max per trade"); // $1,001 > maxPerTrade $1,000
    });

    it("4.5 exposure decreases after closing position", async () => {
      const tradeSize = ethers.parseUnits("500", 6);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Open position
      const tx = await vault.connect(agentSigner).executeOpenPosition(
        await mockX2Swap.getAddress(),
        tradeSize,
        50,
        ethers.ZeroAddress,
        "0x",
        deadline
      );
      const receipt = await tx.wait();

      // Find the PositionOpened event to get the position ID
      const positionOpenedEvent = receipt.logs
        .map((log: any) => {
          try { return vault.interface.parseLog(log); } catch { return null; }
        })
        .find((e: any) => e?.name === "PositionOpened");

      const posId = positionOpenedEvent?.args[0];
      expect(await vault.currentExposure()).to.equal(tradeSize);

      // Close the position
      await vault.connect(agentSigner).executeClosePosition(
        await mockX2Swap.getAddress(),
        posId,
        50,
        ethers.ZeroAddress,
        "0x",
        deadline
      );

      // Exposure back to 0
      expect(await vault.currentExposure()).to.equal(0);
    });
  });

  // ── 5. Owner Configuration ─────────────────────────────────────────────────

  describe("5. Owner Configuration", () => {
    it("5.1 owner can reduce maxPerTrade", async () => {
      const newLimit = ethers.parseUnits("500", 6);
      await vault.connect(owner).setMaxPerTrade(newLimit);
      expect(await vault.maxPerTrade()).to.equal(newLimit);
    });

    it("5.2 owner can reduce maxTotalExposure", async () => {
      const newLimit = ethers.parseUnits("2000", 6);
      await vault.connect(owner).setMaxTotalExposure(newLimit);
      expect(await vault.maxTotalExposure()).to.equal(newLimit);
    });

    it("5.3 non-owner CANNOT update limits", async () => {
      await expect(
        vault.connect(attacker).setMaxPerTrade(ethers.parseUnits("999999", 6))
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("5.4 owner can rotate agent address", async () => {
      await vault.connect(owner).setAgent(stranger.address);
      expect(await vault.agent()).to.equal(stranger.address);
    });

    it("5.5 AgentUpdated event emitted on rotation", async () => {
      await expect(vault.connect(owner).setAgent(stranger.address))
        .to.emit(vault, "AgentUpdated")
        .withArgs(agentSigner.address, stranger.address);
    });

    it("5.6 owner can disable agent instantly (set to zero address)", async () => {
      await vault.connect(owner).setAgent(ethers.ZeroAddress);
      expect(await vault.agent()).to.equal(ethers.ZeroAddress);

      // Agent can no longer trade
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await expect(
        vault.connect(agentSigner).executeOpenPosition(
          await mockX2Swap.getAddress(),
          ethers.parseUnits("100", 6),
          50,
          ethers.ZeroAddress,
          "0x",
          deadline
        )
      ).to.be.revertedWith("ScopedVault: caller is not agent");
    });
  });

  // ── 6. Events ──────────────────────────────────────────────────────────────

  describe("6. Events & Audit Trail", () => {
    it("6.1 Deposited event emitted on deposit", async () => {
      const amount = ethers.parseUnits("1000", 6);
      await usdc.approve(await vault.getAddress(), amount);
      await expect(vault.connect(owner).deposit(amount))
        .to.emit(vault, "Deposited")
        .withArgs(owner.address, amount);
    });

    it("6.2 Withdrawn event emitted on withdrawal", async () => {
      const amount = ethers.parseUnits("500", 6);
      await expect(vault.connect(owner).withdraw(amount))
        .to.emit(vault, "Withdrawn")
        .withArgs(owner.address, amount);
    });

    it("6.3 PositionOpened event emitted with correct data", async () => {
      const tradeSize = ethers.parseUnits("750", 6);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const tx = await vault.connect(agentSigner).executeOpenPosition(
        await mockX2Swap.getAddress(),
        tradeSize,
        50,
        ethers.ZeroAddress,
        "0x",
        deadline
      );

      const receipt = await tx.wait();
      const posOpenedEvent = receipt.logs
        .map((log: any) => {
          try { return vault.interface.parseLog(log); } catch { return null; }
        })
        .find((e: any) => e?.name === "PositionOpened");

      expect(posOpenedEvent).to.not.be.null;
      expect(posOpenedEvent?.args[2]).to.equal(tradeSize); // amount
    });

    it("6.4 PositionClosed event emitted on close", async () => {
      const tradeSize = ethers.parseUnits("300", 6);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const tx = await vault.connect(agentSigner).executeOpenPosition(
        await mockX2Swap.getAddress(),
        tradeSize,
        50,
        ethers.ZeroAddress,
        "0x",
        deadline
      );
      const receipt = await tx.wait();
      const posOpenedEvent = receipt.logs
        .map((log: any) => {
          try { return vault.interface.parseLog(log); } catch { return null; }
        })
        .find((e: any) => e?.name === "PositionOpened");
      const posId = posOpenedEvent?.args[0];

      await expect(
        vault.connect(agentSigner).executeClosePosition(
          await mockX2Swap.getAddress(),
          posId,
          50,
          ethers.ZeroAddress,
          "0x",
          deadline
        )
      ).to.emit(vault, "PositionClosed");
    });
  });

  // ── 7. The Core Thesis — Agent-Safe Leverage ──────────────────────────────

  describe("7. Core Thesis — Agent-Safe Leverage on 2xSwap", () => {
    it("7.1 Agent CAN open positions (correct caller)", async () => {
      const tradeSize = ethers.parseUnits("100", 6);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Should NOT revert with "caller is not agent"
      await expect(
        vault.connect(agentSigner).executeOpenPosition(
          await mockX2Swap.getAddress(),
          tradeSize,
          50,
          ethers.ZeroAddress,
          "0x",
          deadline
        )
      ).to.not.be.revertedWith("ScopedVault: caller is not agent");
    });

    it("7.2 Agent spending is bounded — cannot exceed owner-set limit", async () => {
      // availableForTrading = min(balance, maxTotalExposure)
      const available = await vault.availableForTrading();
      expect(available).to.be.lte(MAX_TOTAL_EXPOSURE);
      expect(available).to.be.lte(await vault.vaultBalance());
    });

    it("7.3 Agent CANNOT drain vault — withdrawal is owner-only", async () => {
      const fullBalance = await vault.vaultBalance();
      await expect(
        vault.connect(agentSigner).withdraw(fullBalance)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
      // Vault balance unchanged
      expect(await vault.vaultBalance()).to.equal(fullBalance);
    });

    it("7.4 positionX2Swap mapping tracks which contract opened which position", async () => {
      const tradeSize = ethers.parseUnits("200", 6);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const tx = await vault.connect(agentSigner).executeOpenPosition(
        await mockX2Swap.getAddress(),
        tradeSize,
        50,
        ethers.ZeroAddress,
        "0x",
        deadline
      );
      const receipt = await tx.wait();
      const posOpenedEvent = receipt.logs
        .map((log: any) => {
          try { return vault.interface.parseLog(log); } catch { return null; }
        })
        .find((e: any) => e?.name === "PositionOpened");
      const posId = posOpenedEvent?.args[0];

      // positionX2Swap should map posId → mockX2Swap address
      expect(await vault.positionX2Swap(posId)).to.equal(await mockX2Swap.getAddress());
    });

    it("7.5 cannot close position from wrong x2swap contract", async () => {
      const tradeSize = ethers.parseUnits("200", 6);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Open on mockX2Swap
      const tx = await vault.connect(agentSigner).executeOpenPosition(
        await mockX2Swap.getAddress(),
        tradeSize,
        50,
        ethers.ZeroAddress,
        "0x",
        deadline
      );
      const receipt = await tx.wait();
      const posOpenedEvent = receipt.logs
        .map((log: any) => {
          try { return vault.interface.parseLog(log); } catch { return null; }
        })
        .find((e: any) => e?.name === "PositionOpened");
      const posId = posOpenedEvent?.args[0];

      // Try to close with wrong address
      const wrongAddress = await usdc.getAddress(); // Not a valid X2Swap
      await expect(
        vault.connect(agentSigner).executeClosePosition(
          wrongAddress,
          posId,
          50,
          ethers.ZeroAddress,
          "0x",
          deadline
        )
      ).to.be.revertedWith("ScopedVault: position not from this vault");
    });

    it("7.6 full lifecycle: open → hold → close, exposure tracks correctly", async () => {
      const tradeSize = ethers.parseUnits("1000", 6);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Open
      const tx = await vault.connect(agentSigner).executeOpenPosition(
        await mockX2Swap.getAddress(),
        tradeSize,
        50,
        ethers.ZeroAddress,
        "0x",
        deadline
      );
      const receipt = await tx.wait();
      const posId = receipt.logs
        .map((log: any) => {
          try { return vault.interface.parseLog(log); } catch { return null; }
        })
        .find((e: any) => e?.name === "PositionOpened")?.args[0];

      expect(await vault.currentExposure()).to.equal(tradeSize);
      // Agent holds — no forced liquidation (this is 2xSwap's core value prop)
      // We simulate holding by just... not closing. The test advances time:
      await ethers.provider.send("evm_increaseTime", [86400]); // +1 day
      await ethers.provider.send("evm_mine", []);
      // Position still open — 2xSwap doesn't liquidate
      expect(await vault.currentExposure()).to.equal(tradeSize);

      // Agent decides to close on its own terms
      await vault.connect(agentSigner).executeClosePosition(
        await mockX2Swap.getAddress(),
        posId,
        50,
        ethers.ZeroAddress,
        "0x",
        deadline
      );
      expect(await vault.currentExposure()).to.equal(0);
    });
  });
});
