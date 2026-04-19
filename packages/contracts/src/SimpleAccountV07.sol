// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * SimpleAccountV07 - ERC-4337 v0.7 compatible smart wallet
 * Uses the old non-packed UserOp format (v0.6/v0.7 style)
 */
interface IEntryPointV07 {
    struct UserOp {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
    }
    
    function handleOps(UserOp[] calldata ops, address payable beneficiary) external;
    function getNonce(address sender, uint192 key) external view returns (uint256);
}

contract SimpleAccountV07 {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    
    address public immutable entryPoint;
    address public owner;
    uint256 public nonce;

    event SimpleAccountInitialized(address indexed entryPoint, address indexed owner);

    constructor(address _entryPoint) {
        entryPoint = _entryPoint;
    }

    modifier onlyEntryPoint() {
        require(msg.sender == entryPoint, "only EntryPoint");
        _;
    }

    function initialize(address _owner) external {
        require(owner == address(0), "already initialized");
        owner = _owner;
        emit SimpleAccountInitialized(entryPoint, _owner);
    }

    function validateUserOp(
        IEntryPointV07.UserOp calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external onlyEntryPoint returns (uint256) {
        require(userOp.nonce == nonce, "invalid nonce");
        
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        require(hash.recover(userOp.signature) == owner, "invalid signature");
        
        if (missingAccountFunds > 0) {
            payable(msg.sender).transfer(missingAccountFunds);
        }
        
        nonce++;
        return 0;
    }

    function execute(address dest, uint256 value, bytes calldata func) external onlyEntryPoint {
        if (func.length > 0) {
            (bool success, ) = dest.call{value: value}(func);
            require(success, "exec failed");
        } else {
            payable(dest).transfer(value);
        }
    }

    receive() external payable {
        require(msg.sender != entryPoint, "denied");
    }
}