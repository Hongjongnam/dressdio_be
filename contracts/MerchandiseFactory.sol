// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./MerchandiseNFT.sol";
import "./PlatformRegistry.sol";

contract MerchandiseFactory is Ownable {
    address[] public allMerchandiseNFTs;
    PlatformRegistry public platformRegistry;

    event MerchandiseCreated(address nft, address influencer, address creator, uint256 creatorSBTId);

    constructor(address _platformRegistry) Ownable(msg.sender) {
        platformRegistry = PlatformRegistry(_platformRegistry);
    }

    function createMerchandiseNFT(
        string memory name,
        string memory symbol,
        address influencer,
        address creator,
        uint256 creatorSBTId
    ) external onlyOwner returns (address) {
        require(
            platformRegistry.validateCreatorSBT(creator, creatorSBTId, "brand") ||
            platformRegistry.validateCreatorSBT(creator, creatorSBTId, "artist"),
            "Invalid or insufficient SBT"
        );
        platformRegistry.incrementSBTUseCount(creatorSBTId);
        MerchandiseNFT nft = new MerchandiseNFT(name, symbol, influencer, creator, creatorSBTId);
        allMerchandiseNFTs.push(address(nft));
        emit MerchandiseCreated(address(nft), influencer, creator, creatorSBTId);
        return address(nft);
    }

    function getAllMerchandiseNFTs() external view returns (address[] memory) {
        return allMerchandiseNFTs;
    }
}