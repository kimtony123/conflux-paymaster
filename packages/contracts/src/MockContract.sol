// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockContract {
    uint256 public value;
    bool public boolValue;
    address public addressValue;
    
    function setValue(uint256 _value) external {
        value = _value;
    }
    
    function setBoolValue(bool _value) external {
        boolValue = _value;
    }
    
    function setAddressValue(address _value) external {
        addressValue = _value;
    }
    
    function getValue() external view returns (uint256) {
        return value;
    }
    
    receive() external payable {
        value = msg.value;
    }
}
