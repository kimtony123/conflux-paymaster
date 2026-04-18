// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IEntryPoint {
    function depositTo(address) external payable;
    function balanceOf(address) external view returns (uint256);
    function withdrawTo(address payable, uint256) external;
}

struct UserOperation {
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

contract VerifyingPaymaster is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    uint256 public constant PAYMASTER_DATA_LENGTH = 20 + 64;

    IEntryPoint public immutable entryPoint;

    address public verifier;
    uint256 public minStake;
    uint256 public unstakeDelay;

    event UserOperationSponsored(
        bytes32 indexed userOpHash,
        address indexed sender,
        address indexed paymaster
    );
    event VerifierSet(address indexed oldVerifier, address indexed newVerifier);

    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "Only EntryPoint");
        _;
    }

    constructor(
        address _entryPoint,
        address _verifier,
        uint256 _minStake,
        uint256 _unstakeDelay
    ) Ownable(msg.sender) {
        entryPoint = IEntryPoint(_entryPoint);
        verifier = _verifier;
        minStake = _minStake;
        unstakeDelay = _unstakeDelay;
    }

    function setVerifier(address _newVerifier) external onlyOwner {
        require(_newVerifier != address(0), "Invalid verifier");
        emit VerifierSet(verifier, _newVerifier);
        verifier = _newVerifier;
    }

    function setMinStake(uint256 _newMinStake) external onlyOwner {
        minStake = _newMinStake;
    }

    function deposit() external payable onlyOwner {
        entryPoint.depositTo{value: msg.value}(address(this));
    }

    function addStake(uint256 _unstakeDelaySec) external payable onlyOwner {
        require(_unstakeDelaySec >= unstakeDelay, "Cannot decrease unstake delay");
        unstakeDelay = _unstakeDelaySec;
        entryPoint.depositTo{value: msg.value}(address(this));
    }

    function withdrawStake(address payable withdrawAddress) external onlyOwner {
        entryPoint.withdrawTo(withdrawAddress, entryPoint.balanceOf(address(this)));
    }

    function withdrawFunds(address payable withdrawAddress, uint256 amount) external onlyOwner {
        entryPoint.withdrawTo(withdrawAddress, amount);
    }

    function getHash(
        UserOperation calldata userOp,
        uint48 validUntil,
        uint48 validAfter
    ) public view returns (bytes32) {
        bytes32 userOpHash = keccak256(abi.encode(
            userOp.sender,
            userOp.nonce,
            keccak256(userOp.initCode),
            keccak256(userOp.callData),
            userOp.callGasLimit,
            userOp.verificationGasLimit,
            userOp.preVerificationGas,
            userOp.maxFeePerGas,
            userOp.maxPriorityFeePerGas,
            keccak256(userOp.paymasterAndData)
        ));

        return keccak256(abi.encode(
            userOpHash,
            validUntil,
            validAfter
        ));
    }

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 requiredPreFund
    ) external onlyEntryPoint returns (bytes memory context, uint256 validationData) {
        (requiredPreFund);
        
        if (userOp.paymasterAndData.length < PAYMASTER_DATA_LENGTH) {
            return ("", _packValidationData(true, 0, 0));
        }
        
        bytes calldata paymasterAndData = userOp.paymasterAndData;
        
        bytes32 hash = getHash(userOp, 0, 0);
        bytes32 ethSignedHash = hash.toEthSignedMessageHash();
        
        bytes memory signature = new bytes(userOp.paymasterAndData.length - PAYMASTER_DATA_LENGTH);
        for (uint256 i = 0; i < signature.length; i++) {
            signature[i] = userOp.paymasterAndData[PAYMASTER_DATA_LENGTH + i];
        }
        
        if (ethSignedHash.recover(signature) != verifier) {
            return ("", _packValidationData(true, 0, 0));
        }
        
        emit UserOperationSponsored(userOpHash, userOp.sender, address(this));
        
        return ("", _packValidationData(false, 0, 0));
    }

    function _packValidationData(bool failed, uint48 validUntil, uint48 validAfter) internal pure returns (uint256) {
        uint256 validUntilInt = validUntil;
        uint256 validAfterInt = validAfter;
        
        if (failed) {
            return (1 << 255) | (validUntilInt << 160) | validAfterInt;
        } else {
            return (validUntilInt << 160) | validAfterInt;
        }
    }

    receive() external payable {}
}
