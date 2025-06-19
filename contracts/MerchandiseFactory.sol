// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "./MerchandiseNFT.sol";
import "./PlatformRegistry.sol";

contract MerchandiseFactory {
    address public owner;
    address[] public allMerchandiseNFTs;
    PlatformRegistry public platformRegistry;

    event MerchandiseCreated(address nft, address influencer, address creator, uint256 creatorSBTId);

    constructor(address _platformRegistry) {
        owner = msg.sender;
        platformRegistry = PlatformRegistry(_platformRegistry);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function createMerchandiseNFT(
        string memory name,
        string memory symbol,
        address influencer,
        address creator,
        uint256 creatorSBTId
    ) external returns (address) {
        // SBT 검증 - 브랜드 또는 아티스트만 머천다이즈 NFT 생성 가능
        require(
            platformRegistry.validateCreatorSBT(creator, creatorSBTId, "brand") ||
            platformRegistry.validateCreatorSBT(creator, creatorSBTId, "artist"),
            "Invalid or insufficient SBT"
        );

        // SBT 사용 횟수 증가
        platformRegistry.incrementSBTUseCount(creatorSBTId);

        // NFT 생성
        MerchandiseNFT nft = new MerchandiseNFT(name, symbol, influencer, creator, creatorSBTId);
        allMerchandiseNFTs.push(address(nft));
        emit MerchandiseCreated(address(nft), influencer, creator, creatorSBTId);
        return address(nft);
    }

    function getAllMerchandiseNFTs() external view returns (address[] memory) {
        return allMerchandiseNFTs;
    }
}
