// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IPNFT.sol";

contract IPNFTFactory {
    address public owner;
    address[] public allIPNFTs;

    event IPNFTCreated(address nft, address creator, uint256 creatorSBTId);

    constructor() {
        owner = msg.sender;
    }

    function createIPNFT(
        string memory name,
        string memory symbol,
        address creator,
        uint256 creatorSBTId
    ) external returns (address) {
        IPNFT nft = new IPNFT(name, symbol, creator, creatorSBTId);
        allIPNFTs.push(address(nft));
        emit IPNFTCreated(address(nft), creator, creatorSBTId);
        return address(nft);
    }

    function getAllIPNFTs() external view returns (address[] memory) {
        return allIPNFTs;
    }
}
