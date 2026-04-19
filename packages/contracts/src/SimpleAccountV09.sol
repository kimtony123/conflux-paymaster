// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./aa/interfaces/IEntryPoint.sol";
import "./aa/interfaces/IAccount.sol";
import "./aa/interfaces/PackedUserOperation.sol";
import "./aa/core/UserOperationLib.sol";

/**
 * SimpleAccountV09 - ERC-4337 v0.9 compatible smart wallet
 */
contract SimpleAccountV09 is IAccount {
    using UserOperationLib for PackedUserOperation;

    IEntryPoint public immutable entryPoint;
    address public immutable owner;
    uint256 public nonce;

    bytes32 constant ETHSIGNED_HASH_PREFIX = keccak256(
        bytes("\x19Ethereum Signed Message:\n32")
    );

    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "Only EntryPoint");
        _;
    }

    constructor(IEntryPoint _entryPoint, address _owner) {
        entryPoint = _entryPoint;
        owner = _owner;
    }

    receive() external payable {
        require(msg.sender != address(entryPoint), "denied");
    }

    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external onlyEntryPoint returns (uint256) {
        require(userOp.nonce == nonce, "invalid nonce");
        
        // ✅ CORRECT: Validate signature directly against userOpHash from EntryPoint
        // EntryPoint already includes chainId and entryPoint in the hash
        require(_recover(userOpHash, userOp.signature) == owner, "invalid sig");
        
        if (missingAccountFunds > 0) {
            payable(msg.sender).transfer(missingAccountFunds);
        }
        
        nonce++;
        return 0;
    }

    function toEthSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(ETHSIGNED_HASH_PREFIX, hash));
    }

    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "invalid sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 0x20))
            v := byte(0, calldataload(add(sig.offset, 0x40)))
        }
        return ecrecover(hash, v, r, s);
    }

    function execute(
        address dest,
        uint256 value,
        bytes calldata func
    ) external onlyEntryPoint {
        _execute(dest, value, func);
    }

    function executeBatch(
        address[] calldata dests,
        uint256[] calldata values,
        bytes[] calldata funcs
    ) external onlyEntryPoint {
        require(dests.length == funcs.length, "len mismatch");
        
        for (uint256 i = 0; i < dests.length; i++) {
            _execute(dests[i], values[i], funcs[i]);
        }
    }

    function _execute(address dest, uint256 value, bytes calldata func) internal {
        if (dest == address(0)) {
            require(value == 0, "zero addr with value");
        } else {
            if (func.length > 0) {
                (bool success, ) = dest.call{value: value}(func);
                require(success, "exec failed");
            } else {
                payable(dest).transfer(value);
            }
        }
    }

    function getNonce() external view returns (uint256) {
        return nonce;
    }
}