// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "./IPNFT.sol";
import "./PlatformRegistry.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract IPNFTFactory is Ownable {
    IPNFT public ipnft;
    PlatformRegistry public platformRegistry;
    IERC20 public dpToken;
    uint256 public mintingFee = 1e18; // 기본값: 1 DP (18 decimals)

    event IPNFTDeployed(address nft);
    event TokenMinted(
        uint256 indexed tokenId,
        address indexed creator,
        uint256 creatorSBTId,
        string name,
        string symbol
    );
    event MintingFeeUpdated(uint256 oldFee, uint256 newFee);

    constructor(
        string memory name,
        string memory symbol,
        address _platformRegistry,
        address _dpToken
    ) Ownable(msg.sender) {
        platformRegistry = PlatformRegistry(_platformRegistry);
        dpToken = IERC20(_dpToken);

        // Deploy the single IPNFT contract
        ipnft = new IPNFT(name, symbol, address(this));
        emit IPNFTDeployed(address(ipnft));
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
        bool isBrand = platformRegistry.validateCreatorSBT(msg.sender, creatorSBTId, "brand");
        bool isArtist = platformRegistry.validateCreatorSBT(msg.sender, creatorSBTId, "artist");
        require(
            isBrand || isArtist,
            "Invalid or insufficient SBT"
        );

        // 동적 수수료 수취
        require(
            dpToken.transferFrom(msg.sender, address(this), mintingFee),
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

        // creatorType 결정 (artist/brand)
        string memory creatorType = isBrand ? "brand" : "artist";
        // PlatformRegistry에 IPNFT 등록
        platformRegistry.registerIPNFTTokenId(tokenId, msg.sender, creatorType);

        emit TokenMinted(
            tokenId,
            msg.sender,
            creatorSBTId,
            name_,
            description
        );

        return tokenId;
    }

    function setMintingFee(uint256 newFee) external onlyOwner {
        require(newFee > 0, "Minting fee must be greater than 0");
        uint256 oldFee = mintingFee;
        mintingFee = newFee;
        emit MintingFeeUpdated(oldFee, newFee);
    }

    function getMintingFee() external view returns (uint256) {
        return mintingFee;
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
