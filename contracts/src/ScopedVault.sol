// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ScopedVault
 * @notice A vault that allows an AI agent to trade on 2xSwap within strict limits.
 *
 * The owner deposits USDC and configures:
 *   - maxPerTrade: max USDC per single position
 *   - maxTotalExposure: max aggregate open position value
 *   - timeWindow: rolling window for trade frequency limits
 *
 * The designated agent address can open/close positions on 2xSwap,
 * but CANNOT withdraw funds. Only the owner can withdraw.
 *
 * All actions emit events for full auditability.
 */
interface IX2Swap {
    function openPosition(
        uint256 assetAmount,
        uint256 maxDeviationBps,
        address exchangeAddress,
        bytes calldata path,
        uint256 deadline
    ) external returns (uint256);

    function closePosition(
        uint256 id,
        uint256 maxDeviationBps,
        address exchangeAddress,
        bytes calldata path,
        uint256 deadline
    ) external;
}

contract ScopedVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── State ─────────────────────────────────────────────────

    IERC20 public immutable usdc;
    address public agent;

    uint256 public maxPerTrade;
    uint256 public maxTotalExposure;
    uint256 public timeWindow;

    uint256 public currentExposure;
    uint256 public tradesInWindow;
    uint256 public windowStart;

    // Track which positions this vault opened
    mapping(uint256 => address) public positionX2Swap; // posId → x2swap contract
    mapping(uint256 => uint256) public positionAmount;  // posId → USDC amount

    // ── Events ────────────────────────────────────────────────

    event Deposited(address indexed owner, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount);
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);
    event LimitsUpdated(uint256 maxPerTrade, uint256 maxTotalExposure, uint256 timeWindow);
    event PositionOpened(uint256 indexed positionId, address indexed x2swap, uint256 amount, uint256 timestamp);
    event PositionClosed(uint256 indexed positionId, address indexed x2swap, uint256 timestamp);

    // ── Modifiers ─────────────────────────────────────────────

    modifier onlyAgent() {
        require(msg.sender == agent, "ScopedVault: caller is not agent");
        _;
    }

    // ── Constructor ───────────────────────────────────────────

    constructor(
        address _usdc,
        address _agent,
        uint256 _maxPerTrade,
        uint256 _maxTotalExposure,
        uint256 _timeWindow
    ) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        agent = _agent;
        maxPerTrade = _maxPerTrade;
        maxTotalExposure = _maxTotalExposure;
        timeWindow = _timeWindow;
        windowStart = block.timestamp;

        emit AgentUpdated(address(0), _agent);
        emit LimitsUpdated(_maxPerTrade, _maxTotalExposure, _timeWindow);
    }

    // ── Owner Functions ───────────────────────────────────────

    function deposit(uint256 amount) external onlyOwner {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function setAgent(address _agent) external onlyOwner {
        emit AgentUpdated(agent, _agent);
        agent = _agent;
    }

    function setMaxPerTrade(uint256 _maxPerTrade) external onlyOwner {
        maxPerTrade = _maxPerTrade;
        emit LimitsUpdated(maxPerTrade, maxTotalExposure, timeWindow);
    }

    function setMaxTotalExposure(uint256 _maxTotalExposure) external onlyOwner {
        maxTotalExposure = _maxTotalExposure;
        emit LimitsUpdated(maxPerTrade, maxTotalExposure, timeWindow);
    }

    function setTimeWindow(uint256 _timeWindow) external onlyOwner {
        timeWindow = _timeWindow;
        emit LimitsUpdated(maxPerTrade, maxTotalExposure, timeWindow);
    }

    // ── Agent Functions ───────────────────────────────────────

    /**
     * @notice Agent opens a position on a specified X2Swap contract.
     * @dev Enforces per-trade limit, total exposure limit, and time window.
     */
    function executeOpenPosition(
        address x2swap,
        uint256 assetAmount,
        uint256 maxDeviationBps,
        address exchangeAddress,
        bytes calldata path,
        uint256 deadline
    ) external onlyAgent nonReentrant returns (uint256) {
        // Enforce limits
        require(assetAmount <= maxPerTrade, "ScopedVault: exceeds max per trade");
        require(currentExposure + assetAmount <= maxTotalExposure, "ScopedVault: exceeds max exposure");

        // Reset window if expired
        if (block.timestamp > windowStart + timeWindow) {
            tradesInWindow = 0;
            windowStart = block.timestamp;
        }

        // Approve X2Swap to spend USDC
        usdc.approve(x2swap, assetAmount);

        // Open position
        uint256 posId = IX2Swap(x2swap).openPosition(
            assetAmount,
            maxDeviationBps,
            exchangeAddress,
            path,
            deadline
        );

        // Track position
        positionX2Swap[posId] = x2swap;
        positionAmount[posId] = assetAmount;
        currentExposure += assetAmount;
        tradesInWindow++;

        emit PositionOpened(posId, x2swap, assetAmount, block.timestamp);
        return posId;
    }

    /**
     * @notice Agent closes a position on a specified X2Swap contract.
     */
    function executeClosePosition(
        address x2swap,
        uint256 positionId,
        uint256 maxDeviationBps,
        address exchangeAddress,
        bytes calldata path,
        uint256 deadline
    ) external onlyAgent nonReentrant {
        require(positionX2Swap[positionId] == x2swap, "ScopedVault: position not from this vault");

        IX2Swap(x2swap).closePosition(
            positionId,
            maxDeviationBps,
            exchangeAddress,
            path,
            deadline
        );

        // Update exposure
        uint256 amount = positionAmount[positionId];
        currentExposure = currentExposure > amount ? currentExposure - amount : 0;

        // Clean up
        delete positionX2Swap[positionId];
        delete positionAmount[positionId];

        emit PositionClosed(positionId, x2swap, block.timestamp);
    }

    // ── View Functions ────────────────────────────────────────

    function vaultBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function availableForTrading() external view returns (uint256) {
        uint256 balance = usdc.balanceOf(address(this));
        uint256 remaining = maxTotalExposure > currentExposure
            ? maxTotalExposure - currentExposure
            : 0;
        return balance < remaining ? balance : remaining;
    }

    // ── Emergency ─────────────────────────────────────────────

    /**
     * @notice Owner can rescue any ERC20 token sent to this contract by mistake.
     */
    function rescueToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
    }
}
