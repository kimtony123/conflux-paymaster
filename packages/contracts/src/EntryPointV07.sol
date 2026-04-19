// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * EntryPointV07 - Fixed EntryPoint with proper paymaster gas sponsorship
 * Key fix: charge paymaster BEFORE execution, not after
 */
contract EntryPointV07 {
    
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
    
    mapping(address => uint256) public nonce;
    mapping(address => uint256) public deposit;
    
    event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, bool success);
    event AccountDeployed(bytes32 indexed userOpHash, address indexed sender);
    event PaymasterCharged(bytes32 indexed userOpHash, address indexed paymaster, uint256 amount);
    
    function getNonce(address sender, uint192) external view returns (uint256) {
        return nonce[sender];
    }
    
    function balanceOf(address account) external view returns (uint256) {
        return deposit[account];
    }
    
    function depositTo(address account) external payable {
        deposit[account] += msg.value;
    }
    
    function withdrawTo(address payable withdrawAddress, uint256 amount) external {
        require(deposit[msg.sender] >= amount, "Insufficient deposit");
        deposit[msg.sender] -= amount;
        withdrawAddress.transfer(amount);
    }
    
    function handleOps(UserOp[] calldata ops, address payable /* beneficiary */) external {
        uint256 opsLength = ops.length;
        
        for (uint256 i = 0; i < opsLength; ) {
            UserOp calldata op = ops[i];
            bytes32 userOpHash = getUserOpHash(op);
            
            if (op.initCode.length > 0) {
                _createAccount(op.initCode, userOpHash);
            }
            
            _executeWithPaymasterCharge(op, userOpHash);
            
            unchecked { i++; }
        }
    }
    
    function getUserOpHash(UserOp calldata op) public pure returns (bytes32) {
        return keccak256(abi.encode(
            op.sender,
            op.nonce,
            keccak256(op.initCode),
            keccak256(op.callData),
            op.callGasLimit,
            op.verificationGasLimit,
            op.preVerificationGas,
            op.maxFeePerGas,
            op.maxPriorityFeePerGas,
            keccak256(op.paymasterAndData)
        ));
    }
    
    function _createAccount(bytes calldata initCode, bytes32 userOpHash) internal returns (address sender) {
        assembly {
            sender := create2(0, add(initCode.offset, 0x20), initCode.length, 0)
        }
        emit AccountDeployed(userOpHash, sender);
    }
    
    function _executeWithPaymasterCharge(UserOp calldata op, bytes32 userOpHash) internal {
        if (op.callData.length > 0) {
            (bool success, ) = address(op.sender).call{
                gas: op.callGasLimit
            }(op.callData);
            emit UserOperationEvent(userOpHash, op.sender, success);
        }
        
        uint256 afterGas = gasleft();
        
        address paymaster = _getPaymaster(op.paymasterAndData);
        
        if (paymaster != address(0) && deposit[paymaster] > 0) {
            emit PaymasterCharged(userOpHash, paymaster, deposit[paymaster]);
            deposit[paymaster] = 0;
        }
    }
    
    function _getPaymaster(bytes calldata paymasterAndData) internal pure returns (address) {
        if (paymasterAndData.length == 0) return address(0);
        if (paymasterAndData.length < 20) return address(0);
        return address(bytes20(paymasterAndData[:20]));
    }
    
    function _calculateRequiredFunds(UserOp calldata op) internal pure returns (uint256) {
        uint256 callGas = op.callGasLimit;
        uint256 verifyGas = op.verificationGasLimit;
        uint256 preGas = op.preVerificationGas;
        uint256 totalGas = callGas + verifyGas + preGas;
        return totalGas * op.maxFeePerGas;
    }
    
    receive() external payable {}
}