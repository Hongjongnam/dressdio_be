// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract IPNFT is ERC721, Ownable {
    uint256 private _nextTokenId;
    address public factory;

    struct TokenInfo {
        address creator;
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
        uint256 supplyPrice
    ) external onlyFactory returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        
        _mint(to, tokenId);
        
        tokenInfo[tokenId] = TokenInfo({
            creator: creator,
            creatorSBTId: creatorSBTId,
            ipfsImage: ipfsImage,
            name: name_,
            description: description,
            price: price,
            supplyPrice: supplyPrice,
            createdAt: block.timestamp
        });

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

    function getTokenInfo(uint256 tokenId) public view returns (TokenInfo memory) {
        require(_exists(tokenId), "Token does not exist");
        return tokenInfo[tokenId];
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

    function _existsPublic(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }
}