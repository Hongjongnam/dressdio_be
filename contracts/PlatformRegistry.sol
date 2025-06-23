// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

interface ICreatorSBT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getCreatorType(uint256 tokenId) external view returns (string memory);
    function incrementUseCount(uint256 tokenId) external;
}

contract PlatformRegistry {
    address public owner;
    address public merchandiseFactory;
    address public ipnftFactory;
    address public sbtContract; // SBT 컨트랙트 주소

    event FactoryRegistered(string factoryType, address factory);
    event SBTRegistered(address sbt);
    event SBTValidated(address creator, uint256 sbtId, string creatorType);
    event SBTUseCountIncremented(uint256 sbtId);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyRegisteredContracts() {
        require(
            msg.sender == merchandiseFactory ||
            msg.sender == ipnftFactory,
            "Not registered contract"
        );
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

    // SBT 검증 함수
    function validateCreatorSBT(
        address _creator, 
        uint256 _sbtId, 
        string memory _requiredType
    ) public view returns (bool) {
        require(sbtContract != address(0), "SBT contract not set");
        
        ICreatorSBT sbt = ICreatorSBT(sbtContract);
        try sbt.ownerOf(_sbtId) returns (address sbtOwner) {
            if (sbtOwner != _creator) return false;
            string memory creatorType = sbt.getCreatorType(_sbtId);
            return keccak256(bytes(creatorType)) == keccak256(bytes(_requiredType));
        } catch {
            return false;
        }
    }

    // SBT useCount 증가 함수
    function incrementSBTUseCount(uint256 _sbtId) external onlyRegisteredContracts {
        require(sbtContract != address(0), "SBT contract not set");
        
        ICreatorSBT(sbtContract).incrementUseCount(_sbtId);
        emit SBTUseCountIncremented(_sbtId);
    }

    // 등록된 컨트랙트 확인 함수
    function isRegisteredContract(address _contract) public view returns (bool) {
        return _contract == merchandiseFactory || _contract == ipnftFactory;
    }
}