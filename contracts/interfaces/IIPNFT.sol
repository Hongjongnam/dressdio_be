// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IIPNFT {
    // IPNFT의 핵심 정보를 담는 구조체 (IPNFT.sol과 완벽히 일치)
    struct TokenInfo {
        address owner;
        address creator;
        uint256 creatorSBTId;
        string ipfsImage;
        string name;
        string description;
        uint256 price;
        uint256 supplyPrice;
        uint256 createdAt;
    }

    function ownerOf(uint256 tokenId) external view returns (address);
    function getTokenInfo(uint256 tokenId) external view returns (TokenInfo memory);
} 