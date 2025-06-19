// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MerchandiseNFT is ERC721, Ownable {
    address public influencer;
    address public creator;
    uint256 public creatorSBTId;
    uint256 public nextTokenId;
    mapping(uint256 => bool) public status; // 판매 가능 여부

    constructor(
        string memory name,
        string memory symbol,
        address _influencer,
        address _creator,
        uint256 _creatorSBTId
    ) ERC721(name, symbol) Ownable(msg.sender) {
        influencer = _influencer;
        creator = _creator;
        creatorSBTId = _creatorSBTId;
    }

    function mint(address to) external onlyOwner returns (uint256) {
        uint256 tokenId = nextTokenId++;
        _mint(to, tokenId);
        status[tokenId] = false; // 기본값 false
        return tokenId;
    }

    function setStatus(uint256 tokenId, bool _status) external onlyOwner {
        status[tokenId] = _status;
    }
}
