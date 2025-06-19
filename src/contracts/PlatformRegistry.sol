pragma solidity ^0.8.20;

contract PlatformRegistry {
    address public owner;
    address public merchandiseFactory;
    address public ipnftFactory;
    address public sbtContract; // SBT 컨트랙트 주소

    event FactoryRegistered(string factoryType, address factory);
    event SBTRegistered(address sbt);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function setMerchandiseFactory(address _factory) external onlyOwner {
        merchandiseFactory = _factory;
        emit FactoryRegistered("merchandise", _factory);
    }

    function setIPNFTFactory(address _factory) external onlyOwner {
        ipnftFactory = _factory;
        emit FactoryRegistered("ipnft", _factory);
    }

    function setSBTContract(address _sbt) external onlyOwner {
        sbtContract = _sbt;
        emit SBTRegistered(_sbt);
    }
}