// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract IPNFT is ERC721, Ownable {
    uint256 private _nextTokenId;
    address public factory;

    struct TokenInfo {
        address owner; // 현재 소유자
        address creator; // 원작자
        uint256 creatorSBTId;
        string ipfsImage;
        string name;
        string description;
        uint256 price;
        uint256 supplyPrice;
        uint256 createdAt;
    }

    // Mappings
    mapping(uint256 => TokenInfo) public tokenInfo;
    mapping(address => uint256[]) public creatorTokens;
    mapping(uint256 => uint256) public creatorTokenIndex;
    mapping(uint256 => string) private _tokenURIs;

    // Events
    event TokenCreated(
        uint256 indexed tokenId,
        address indexed creator,
        uint256 creatorSBTId,
        string ipfsImage,
        string name,
        string description,
        uint256 price,
        uint256 supplyPrice
    );
    event TokenPriceUpdated(uint256 indexed tokenId, uint256 newPrice, uint256 newSupplyPrice);

    modifier onlyFactory() {
        require(msg.sender == factory, "Only factory can mint");
        _;
    }

    constructor(
        string memory name,
        string memory symbol,
        address _factory
    ) ERC721(name, symbol) Ownable(msg.sender) {
        factory = _factory;
    }

    function mint(
        address to,
        address creator,
        uint256 creatorSBTId,
        string memory ipfsImage,
        string memory name_,
        string memory description,
        uint256 price,
        uint256 supplyPrice,
        string memory tokenURI_
    ) external onlyFactory returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        
        _mint(to, tokenId);
        
        tokenInfo[tokenId] = TokenInfo({
            owner: to, // owner 필드 추가
            creator: creator,
            creatorSBTId: creatorSBTId,
            ipfsImage: ipfsImage,
            name: name_,
            description: description,
            price: price,
            supplyPrice: supplyPrice,
            createdAt: block.timestamp
        });
        _tokenURIs[tokenId] = tokenURI_;

        // Add token to creator's list
        creatorTokenIndex[tokenId] = creatorTokens[creator].length;
        creatorTokens[creator].push(tokenId);

        emit TokenCreated(
            tokenId,
            creator,
            creatorSBTId,
            ipfsImage,
            name_,
            description,
            price,
            supplyPrice
        );

        return tokenId;
    }

    function updatePrices(
        uint256 tokenId,
        uint256 newPrice,
        uint256 newSupplyPrice
    ) external {
        require(_exists(tokenId), "Token does not exist");
        require(msg.sender == tokenInfo[tokenId].creator, "Only creator can update prices");
        
        tokenInfo[tokenId].price = newPrice;
        tokenInfo[tokenId].supplyPrice = newSupplyPrice;
        
        emit TokenPriceUpdated(tokenId, newPrice, newSupplyPrice);
    }

    // IIPNFT 인터페이스와 호환되도록 TokenInfo 구조체 사용 및 owner 정보 추가
    function getTokenInfo(uint256 tokenId) external view returns (TokenInfo memory) {
        require(_exists(tokenId), "Token does not exist");
        TokenInfo memory info = tokenInfo[tokenId];
        info.owner = _ownerOf(tokenId); // 최신 소유자 정보 업데이트
        return info;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        return _tokenURIs[tokenId];
    }

    // 주소를 string으로 변환하는 유틸리티 함수
    function toAsciiString(address x) internal pure returns (string memory) {
        bytes memory s = new bytes(42);
        s[0] = '0';
        s[1] = 'x';
        for (uint i = 0; i < 20; i++) {
            uint8 b = uint8(uint(uint160(x)) >> (8 * (19 - i)));
            uint8 hi = b / 16;
            uint8 lo = b - 16 * hi;
            s[2*i + 2] = char(hi);
            s[2*i + 3] = char(lo);
        }
        return string(s);
    }
    function char(uint8 b) internal pure returns (bytes1 c) {
        if (b < 10) return bytes1(b + 0x30);
        else return bytes1(b + 0x57);
    }

    function getCreatorTokens(address creator) public view returns (uint256[] memory) {
        return creatorTokens[creator];
    }

    function getCreatorTokenCount(address creator) public view returns (uint256) {
        return creatorTokens[creator].length;
    }

    function getCurrentTokenId() public view returns (uint256) {
        return _nextTokenId;
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
}