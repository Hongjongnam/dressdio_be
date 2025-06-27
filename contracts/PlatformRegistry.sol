// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ICreatorSBT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getCreatorType(uint256 tokenId) external view returns (string memory);
    function incrementUseCount(uint256 tokenId) external;
    function hasCreatorSbt(address creator, string memory creatorType) external view returns (bool);
}

interface IIPNFTFactory {
    function getIPNFTAddress() external view returns (address);
}

interface IIPNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getTokenInfo(uint256 tokenId) external view returns (
        address owner,
        string memory name,
        string memory description,
        uint256 price,
        uint256 supplyPrice,
        address creatorAddress,
        uint256 creatorSBTId,
        string memory imageUri
    );
}

contract PlatformRegistry is Ownable {
    address public merchandiseFactory;
    address public ipnftFactory;
    address public sbtContract; // SBT 컨트랙트 주소
    
    // IPNFT 검증을 위한 매핑
    mapping(uint256 => bool) public validIPNFTTokenIds;
    mapping(address => uint256[]) public creatorIPNFTs; // 크리에이터별 IPNFT 목록
    
    // 플랫폼 통계
    uint256 public totalMerchandiseProjects;
    uint256 public totalIPNFTs;
    uint256 public totalSBTHolders;

    event FactoryRegistered(string factoryType, address factory);
    event SBTRegistered(address sbt);
    event SBTValidated(address creator, uint256 sbtId, string creatorType);
    event SBTUseCountIncremented(uint256 sbtId);
    event IPNFTValidated(uint256 tokenId, address owner, string creatorType);
    event MerchandiseProjectRegistered(address project, address influencer);

    constructor() Ownable(msg.sender) {
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

    // IPNFT 토큰 ID 등록 (IPNFT Factory에서 호출)
    function registerIPNFTTokenId(uint256 tokenId, address owner, string memory creatorType) external onlyRegisteredContracts {
        validIPNFTTokenIds[tokenId] = true;
        creatorIPNFTs[owner].push(tokenId);
        totalIPNFTs++;
        emit IPNFTValidated(tokenId, owner, creatorType);
    }
    
    // IPNFT 토큰 ID 검증
    function isRegisteredIPNFT(uint256 tokenId) external view returns (bool) {
        return validIPNFTTokenIds[tokenId];
    }
    
    // IPNFT 정보 구조체
    struct IPNFTInfo {
        address owner;
        string name;
        string description;
        uint256 price;
        uint256 supplyPrice;
        address creatorAddress;
        uint256 creatorSBTId;
        string imageUri;
    }
    
    // IPNFT 소유자 및 정보 조회
    function getIPNFTInfo(uint256 tokenId) external view returns (
        address owner,
        string memory name,
        string memory description,
        uint256 price,
        uint256 supplyPrice,
        address creatorAddress,
        uint256 creatorSBTId,
        string memory imageUri
    ) {
        IPNFTInfo memory info = _getIPNFTInfoInternal(tokenId);
        return (
            info.owner,
            info.name,
            info.description,
            info.price,
            info.supplyPrice,
            info.creatorAddress,
            info.creatorSBTId,
            info.imageUri
        );
    }
    
    // 내부 IPNFT 정보 조회 함수
    function _getIPNFTInfoInternal(uint256 tokenId) internal view returns (IPNFTInfo memory) {
        require(validIPNFTTokenIds[tokenId], "Invalid IPNFT token ID");
        require(ipnftFactory != address(0), "IPNFT factory not set");
        
        IIPNFTFactory factory = IIPNFTFactory(ipnftFactory);
        address ipnftAddress = factory.getIPNFTAddress();
        IIPNFT ipnft = IIPNFT(ipnftAddress);
        
        address owner;
        string memory name;
        string memory description;
        uint256 price;
        uint256 supplyPrice;
        address creatorAddress;
        uint256 creatorSBTId;
        string memory imageUri;
        
        (owner, name, description, price, supplyPrice, creatorAddress, creatorSBTId, imageUri) = ipnft.getTokenInfo(tokenId);
        
        return IPNFTInfo({
            owner: owner,
            name: name,
            description: description,
            price: price,
            supplyPrice: supplyPrice,
            creatorAddress: creatorAddress,
            creatorSBTId: creatorSBTId,
            imageUri: imageUri
        });
    }
    
    // 문자열을 주소로 변환하는 헬퍼 함수
    function stringToAddress(string memory _address) internal pure returns (address) {
        bytes memory tempBytes = bytes(_address);
        require(tempBytes.length == 42, "Invalid address length");
        require(tempBytes[0] == '0' && tempBytes[1] == 'x', "Invalid address format");
        
        address result;
        assembly {
            result := div(mload(add(add(tempBytes, 0x20), 2)), 0x1000000000000000000000000)
        }
        return result;
    }
    
    // 크리에이터별 IPNFT 목록 조회
    function getCreatorIPNFTs(address creator) external view returns (uint256[] memory) {
        return creatorIPNFTs[creator];
    }
    
    // 브랜드 IPNFT 검증 (creatorType이 "brand"인 IPNFT)
    function validateBrandIPNFT(uint256 tokenId) external view returns (bool) {
        if (!validIPNFTTokenIds[tokenId]) return false;
        
        try this.getIPNFTInfo(tokenId) returns (
            address _owner,
            string memory _name,
            string memory _description,
            uint256 _price,
            uint256 _supplyPrice,
            address creatorAddress,
            uint256 creatorSBTId,
            string memory _imageUri
        ) {
            // SBT에서 creatorType이 "brand"인지 확인
            return validateCreatorSBT(creatorAddress, creatorSBTId, "brand");
        } catch {
            return false;
        }
    }
    
    // 아티스트 IPNFT 검증 (creatorType이 "artist"인 IPNFT)
    function validateArtistIPNFT(uint256 tokenId) external view returns (bool) {
        if (!validIPNFTTokenIds[tokenId]) return false;
        
        try this.getIPNFTInfo(tokenId) returns (
            address _owner,
            string memory _name,
            string memory _description,
            uint256 _price,
            uint256 _supplyPrice,
            address creatorAddress,
            uint256 creatorSBTId,
            string memory _imageUri
        ) {
            // SBT에서 creatorType이 "artist"인지 확인
            return validateCreatorSBT(creatorAddress, creatorSBTId, "artist");
        } catch {
            return false;
        }
    }

    // SBT 검증 함수 (기존 함수 개선)
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
    
    // 인플루언서 SBT 보유 여부 확인
    function hasInfluencerSBT(address creator) external view returns (bool) {
        require(sbtContract != address(0), "SBT contract not set");
        ICreatorSBT sbt = ICreatorSBT(sbtContract);
        return sbt.hasCreatorSbt(creator, "influencer");
    }
    
    // 브랜드 SBT 보유 여부 확인
    function hasBrandSBT(address creator) external view returns (bool) {
        require(sbtContract != address(0), "SBT contract not set");
        ICreatorSBT sbt = ICreatorSBT(sbtContract);
        return sbt.hasCreatorSbt(creator, "brand");
    }
    
    // 아티스트 SBT 보유 여부 확인
    function hasArtistSBT(address creator) external view returns (bool) {
        require(sbtContract != address(0), "SBT contract not set");
        ICreatorSBT sbt = ICreatorSBT(sbtContract);
        return sbt.hasCreatorSbt(creator, "artist");
    }

    // SBT useCount 증가 함수
    function incrementSBTUseCount(uint256 _sbtId) external onlyRegisteredContracts {
        require(sbtContract != address(0), "SBT contract not set");
        
        ICreatorSBT(sbtContract).incrementUseCount(_sbtId);
        emit SBTUseCountIncremented(_sbtId);
    }
    
    // Merchandise 프로젝트 등록 (Merchandise Factory에서 호출)
    function registerMerchandiseProject(address project, address influencer) external onlyRegisteredContracts {
        totalMerchandiseProjects++;
        emit MerchandiseProjectRegistered(project, influencer);
    }

    // 등록된 컨트랙트 확인 함수
    function isRegisteredContract(address _contract) public view returns (bool) {
        return _contract == merchandiseFactory || _contract == ipnftFactory;
    }
    
    // 플랫폼 통계 조회
    function getPlatformStats() external view returns (
        uint256 _totalMerchandiseProjects,
        uint256 _totalIPNFTs,
        uint256 _totalSBTHolders
    ) {
        return (totalMerchandiseProjects, totalIPNFTs, totalSBTHolders);
    }
    
    // IPNFT Factory 주소 조회
    function getIPNFTFactory() external view returns (address) {
        return ipnftFactory;
    }
    
    // Merchandise Factory 주소 조회
    function getMerchandiseFactory() external view returns (address) {
        return merchandiseFactory;
    }
    
    // SBT Contract 주소 조회
    function getSBTContract() external view returns (address) {
        return sbtContract;
    }

    // 소유권 이전 함수 (OpenZeppelin Ownable에서 제공)
    // function transferOwnership(address newOwner) external onlyOwner
    // function renounceOwnership() external onlyOwner
}