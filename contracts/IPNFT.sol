// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract IPNFT is ERC721, Ownable {
    address public creator;
    uint256 public creatorSBTId;
    uint256 public nextTokenId;

    constructor(
        string memory name,
        string memory symbol,
        address _creator,
        uint256 _creatorSBTId
    ) ERC721(name, symbol) Ownable(msg.sender) {
        creator = _creator;
        creatorSBTId = _creatorSBTId;
    }

    function mint(address to) external onlyOwner returns (uint256) {
        uint256 tokenId = nextTokenId++;
        _mint(to, tokenId);
        return tokenId;
    }
}