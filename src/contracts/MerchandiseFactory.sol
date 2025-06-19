pragma solidity ^0.8.20;

import "./MerchandiseNFT.sol";

contract MerchandiseFactory {
    address public owner;
    address[] public allMerchandiseNFTs;

    event MerchandiseCreated(address nft, address influencer, address creator, uint256 creatorSBTId);

    constructor() {
        owner = msg.sender;
    }

    function createMerchandiseNFT(
        string memory name,
        string memory symbol,
        address influencer,
        address creator,
        uint256 creatorSBTId
    ) external returns (address) {
        MerchandiseNFT nft = new MerchandiseNFT(name, symbol, influencer, creator, creatorSBTId);
        allMerchandiseNFTs.push(address(nft));
        emit MerchandiseCreated(address(nft), influencer, creator, creatorSBTId);
        return address(nft);
    }

    function getAllMerchandiseNFTs() external view returns (address[] memory) {
        return allMerchandiseNFTs;
    }
}
