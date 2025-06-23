// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "./IPNFT.sol";
import "./PlatformRegistry.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract IPNFTFactory {
    address public owner;
    IPNFT public ipnft;
    PlatformRegistry public platformRegistry;
    IERC20 public dpToken;
    uint256 public constant MINT_FEE = 1e18; // 1 DP (18 decimals)

    event IPNFTDeployed(address nft);
    event TokenMinted(
        uint256 indexed tokenId,
        address indexed creator,
        uint256 creatorSBTId,
        string name,
        string symbol
    );

    constructor(
        string memory name,
        string memory symbol,
        address _platformRegistry,
        address _dpToken
    ) {
        owner = msg.sender;
        platformRegistry = PlatformRegistry(_platformRegistry);
        dpToken = IERC20(_dpToken);

        // Deploy the single IPNFT contract
        ipnft = new IPNFT(name, symbol, address(this));
        emit IPNFTDeployed(address(ipnft));
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function createToken(
        string memory ipfsImage,
        string memory name_,
        string memory description,
        uint256 price,
        uint256 supplyPrice,
        uint256 creatorSBTId
    ) external returns (uint256) {
        // SBT 검증 (artist 또는 brand)
        require(
            platformRegistry.validateCreatorSBT(msg.sender, creatorSBTId, "artist") ||
            platformRegistry.validateCreatorSBT(msg.sender, creatorSBTId, "brand"),
            "Invalid or insufficient SBT"
        );

        // 1 DP 수취
        require(
            dpToken.transferFrom(msg.sender, address(this), MINT_FEE),
            "DP payment failed"
        );

        // SBT 사용 횟수 증가
        platformRegistry.incrementSBTUseCount(creatorSBTId);

        // Mint new token
        uint256 tokenId = ipnft.mint(
            msg.sender,
            msg.sender,
            creatorSBTId,
            ipfsImage,
            name_,
            description,
            price,
            supplyPrice
        );

        emit TokenMinted(
            tokenId,
            msg.sender,
            creatorSBTId,
            name_,
            description
        );

        return tokenId;
    }

    function getIPNFTAddress() external view returns (address) {
        return address(ipnft);
    }

    function withdrawDPTokens(address to) external onlyOwner {
        uint256 balance = dpToken.balanceOf(address(this));
        require(balance > 0, "No DP tokens to withdraw");
        require(dpToken.transfer(to, balance), "Transfer failed");
    }
}
