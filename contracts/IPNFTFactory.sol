// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "./IPNFT.sol";
import "./PlatformRegistry.sol";

contract IPNFTFactory {
    address public owner;
    address[] public allIPNFTs;
    PlatformRegistry public platformRegistry;

    event IPNFTCreated(address nft, address creator, uint256 creatorSBTId);

    constructor(address _platformRegistry) {
        owner = msg.sender;
        platformRegistry = PlatformRegistry(_platformRegistry);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function createIPNFT(
        string memory name,
        string memory symbol,
        address creator,
        uint256 creatorSBTId
    ) external returns (address) {
        // SBT 검증
        require(
            platformRegistry.validateCreatorSBT(creator, creatorSBTId, "artist"),
            "Invalid or insufficient SBT"
        );

        // SBT 사용 횟수 증가
        platformRegistry.incrementSBTUseCount(creatorSBTId);

        // NFT 생성
        IPNFT nft = new IPNFT(name, symbol, creator, creatorSBTId);
        allIPNFTs.push(address(nft));
        emit IPNFTCreated(address(nft), creator, creatorSBTId);
        return address(nft);
    }

    function getAllIPNFTs() external view returns (address[] memory) {
        return allIPNFTs;
    }
}
