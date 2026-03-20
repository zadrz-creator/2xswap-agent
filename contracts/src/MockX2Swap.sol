// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockX2Swap
 * @notice Mock of the 2xSwap X2Swap contract for testing ScopedVault
 * 
 * The real X2Swap takes USDC from the caller and returns a position ID.
 * This mock accepts USDC and tracks open positions.
 */
contract MockX2Swap {
    IERC20 public immutable usdc;
    uint256 private _nextId = 1;

    mapping(uint256 => bool) public openPositions;
    mapping(uint256 => uint256) public positionAmounts;
    mapping(uint256 => address) public positionOwners;

    event PositionOpened(uint256 indexed id, address indexed owner, uint256 amount);
    event PositionClosed(uint256 indexed id, address indexed owner);

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function openPosition(
        uint256 assetAmount,
        uint256 /* maxDeviationBps */,
        address /* exchangeAddress */,
        bytes calldata /* path */,
        uint256 /* deadline */
    ) external returns (uint256) {
        // Pull USDC from caller (the ScopedVault)
        usdc.transferFrom(msg.sender, address(this), assetAmount);

        uint256 id = _nextId++;
        openPositions[id] = true;
        positionAmounts[id] = assetAmount;
        positionOwners[id] = msg.sender;

        emit PositionOpened(id, msg.sender, assetAmount);
        return id;
    }

    function closePosition(
        uint256 id,
        uint256 /* maxDeviationBps */,
        address /* exchangeAddress */,
        bytes calldata /* path */,
        uint256 /* deadline */
    ) external {
        require(openPositions[id], "MockX2Swap: position not open");
        require(positionOwners[id] == msg.sender, "MockX2Swap: not position owner");

        uint256 amount = positionAmounts[id];
        openPositions[id] = false;

        // Return USDC to caller (simulate position close with 0 PnL for simplicity)
        usdc.transfer(msg.sender, amount);

        emit PositionClosed(id, msg.sender);
    }

    function getPositionAmount(uint256 id) external view returns (uint256) {
        return positionAmounts[id];
    }
}
