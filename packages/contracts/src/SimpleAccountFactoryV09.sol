// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./aa/interfaces/IEntryPoint.sol";
import "./SimpleAccountV09.sol";

/**
 * SimpleAccountFactoryV09 - Factory for v0.9 compatible SimpleAccount
 */
contract SimpleAccountFactoryV09 {
    address public immutable entryPoint;
    
    mapping(address => address) public getAccount;
    address[] public getAccounts;

    event AccountCreated(address indexed account, address indexed owner, uint256 salt);

    constructor(address _entryPoint) {
        entryPoint = _entryPoint;
    }

    function createAccount(address owner, uint256 salt) public returns (address account) {
        require(getAccount[owner] == address(0), "Account already exists");
        
        bytes memory code = abi.encodePacked(
            type(SimpleAccountV09).creationCode,
            abi.encode(entryPoint, owner)
        );
        
        bytes32 saltBytes = keccak256(abi.encode(owner, salt));
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), saltBytes, keccak256(code)));
        
        account = address(uint160(uint256(hash)));
        
        require(account.code.length == 0, "Create2: failed on deploy");
        
        emit AccountCreated(account, owner, salt);
        
        if (getAccount[owner] == address(0)) {
            getAccount[owner] = account;
            getAccounts.push(account);
        }
        
        assembly {
            account := create2(0, add(code, 0x20), mload(code), saltBytes)
        }
        
        SimpleAccountV09(payable(account));
    }

    function getAddress(address owner, uint256 salt) public view returns (address) {
        bytes memory code = abi.encodePacked(
            type(SimpleAccountV09).creationCode,
            abi.encode(entryPoint, owner)
        );
        
        bytes32 saltBytes = keccak256(abi.encode(owner, salt));
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), saltBytes, keccak256(code)));
        
        return address(uint160(uint256(hash)));
    }

    function accountExists(address account) public view returns (bool) {
        return account.code.length > 0;
    }
}