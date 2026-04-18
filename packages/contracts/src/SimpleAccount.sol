// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IEntryPoint {
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
    
    function getUserOpHash(UserOp calldata userOp) external view returns (bytes32);
}

contract SimpleAccount {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    address public immutable entryPoint;
    address public owner;

    uint256 public nonce;
    
    receive() external payable {}

    modifier onlyEntryPoint() {
        require(msg.sender == entryPoint, "Only EntryPoint");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _entryPoint, address _owner) {
        entryPoint = _entryPoint;
        owner = _owner;
    }

    function execute(address dest, uint256 value, bytes calldata func) external onlyEntryPoint {
        _call(dest, value, func);
    }

    function executeBatch(address[] calldata dest, bytes[] calldata func) external onlyEntryPoint {
        require(dest.length == func.length, "Length mismatch");
        for (uint256 i = 0; i < dest.length; i++) {
            _call(dest[i], 0, func[i]);
        }
    }

    function executeBatch(address[] calldata dest, uint256[] calldata values, bytes[] calldata func) external onlyEntryPoint {
        require(dest.length == func.length && dest.length == values.length, "Length mismatch");
        for (uint256 i = 0; i < dest.length; i++) {
            _call(dest[i], values[i], func[i]);
        }
    }

    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    function getNonce() public view returns (uint256) {
        return nonce;
    }

    function getSenderAddress(bytes memory initCode) public pure returns (address) {
        if (initCode.length < 20) {
            return address(0);
        }
        bytes memory data = new bytes(initCode.length - 20);
        for (uint256 i = 0; i < initCode.length - 20; i++) {
            data[i] = initCode[20 + i];
        }
        return toAddress(data);
    }
    
    function toAddress(bytes memory bts) internal pure returns (address) {
        require(bts.length == 20, "Invalid address length");
        return address(uint160(uint256(keccak256(bts))));
    }

    function validateUserOp(
        IEntryPoint.UserOp calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external onlyEntryPoint returns (uint256 validationData) {
        bytes32 ethSignedHash = userOpHash.toEthSignedMessageHash();
        
        if (userOp.initCode.length != 0) {
            require(msg.sender == address(this), "Wrong EntryPoint");
        }
        
        if (ethSignedHash.recover(userOp.signature) != owner) {
            return 1;
        }
        
        _payPrefund(missingAccountFunds);
        
        return 0;
    }

    function _payPrefund(uint256 missingAccountFunds) internal {
        if (missingAccountFunds > 0) {
            payable(msg.sender).transfer(missingAccountFunds);
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        owner = newOwner;
    }
}
