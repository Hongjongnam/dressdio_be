// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract MerchandiseNFT is ERC721, Ownable {
    using Strings for uint256;
    
    // 프로젝트 기본 정보
    address public influencer;
    string public projectName;
    string public productDescription;
    uint256 public totalSupply;
    uint256 public salePrice; // DP 토큰 단위 (wei)
    uint256 public soldCount;
    bool public isActive; // 판매 활성화 여부
    
    // IPNFT 참조 정보 (수익분배용)
    uint256 public brandIPNFTTokenId; // 브랜드 IPNFT (1개)
    uint256[] public artistIPNFTTokenIds; // 아티스트 IPNFT들 (여러개)
    
    // 메타데이터
    string public baseTokenURI;
    string public projectImageURI; // IPFS 이미지 URI
    
    // 수익분배 정보
    mapping(address => uint256) public revenueShares; // 주소별 수익 분배 비율
    address[] public revenueRecipients; // 수익 분배 대상들
    
    // 토큰별 정보
    mapping(uint256 => bool) public tokenExists;
    uint256 public nextTokenId;
    
    // 이벤트
    event MerchandiseMinted(uint256 tokenId, address to, uint256 price);
    event RevenueDistributed(address recipient, uint256 amount);
    event ProjectActivated(bool isActive);
    event RevenueShareUpdated(address recipient, uint256 share);
    
    address public ipnftContract; // IPNFT 컨트랙트 주소 저장
    
    constructor(
        string memory _name,
        string memory _symbol,
        address _influencer,
        string memory _projectName,
        string memory _productDescription,
        uint256 _totalSupply,
        uint256 _salePrice,
        uint256 _brandIPNFTTokenId,
        uint256[] memory _artistIPNFTTokenIds,
        string memory _projectImageURI,
        address _ipnftContract // 추가
    ) ERC721(_name, _symbol) Ownable(_influencer) {
        influencer = _influencer;
        projectName = _projectName;
        productDescription = _productDescription;
        totalSupply = _totalSupply;
        salePrice = _salePrice;
        brandIPNFTTokenId = _brandIPNFTTokenId;
        artistIPNFTTokenIds = _artistIPNFTTokenIds;
        projectImageURI = _projectImageURI;
        isActive = false; // 초기에는 비활성화
        soldCount = 0;
        ipnftContract = _ipnftContract; // 저장
    }
    
    // 판매 활성화/비활성화 (브랜드 IPNFT 소유자만 가능)
    function setActive(bool _isActive) external {
        address brandOwner = IERC721(ipnftContract).ownerOf(brandIPNFTTokenId);
        require(msg.sender == brandOwner, "Only brand IPNFT owner can set status");
        isActive = _isActive;
        emit ProjectActivated(_isActive);
    }
    
    // 수익 분배 대상 및 비율 설정 (인플루언서만 가능)
    function setRevenueShares(
        address[] memory _recipients,
        uint256[] memory _shares
    ) external {
        require(msg.sender == influencer, "Only influencer can set revenue shares");
        require(_recipients.length == _shares.length, "Arrays length mismatch");
        
        // 기존 수익 분배 정보 초기화
        for (uint i = 0; i < revenueRecipients.length; i++) {
            revenueShares[revenueRecipients[i]] = 0;
        }
        delete revenueRecipients;
        
        // 새로운 수익 분배 정보 설정
        for (uint i = 0; i < _recipients.length; i++) {
            require(_recipients[i] != address(0), "Invalid recipient address");
            revenueShares[_recipients[i]] = _shares[i];
            revenueRecipients.push(_recipients[i]);
            emit RevenueShareUpdated(_recipients[i], _shares[i]);
        }
    }
    
    // Merchandise NFT 민팅 (구매자용)
    function mint() external payable {
        require(isActive, "Project is not active");
        require(soldCount < totalSupply, "All merchandise sold out");
        require(msg.value >= salePrice, "Insufficient payment");
        
        uint256 tokenId = nextTokenId++;
        _mint(msg.sender, tokenId);
        tokenExists[tokenId] = true;
        soldCount++;
        
        emit MerchandiseMinted(tokenId, msg.sender, msg.value);
    }
    
    // Factory에서 특정 주소로 NFT 민팅 (에스크로용)
    function mintTo(address to) external returns (uint256 tokenId) {
        require(msg.sender == owner(), "Only owner can mint to specific address");
        require(isActive, "Project is not active");
        require(soldCount < totalSupply, "All merchandise sold out");
        
        tokenId = nextTokenId++;
        _mint(to, tokenId);
        tokenExists[tokenId] = true;
        soldCount++;
        
        emit MerchandiseMinted(tokenId, to, salePrice);
        
        return tokenId;
    }
    
    // 수익 분배 실행 (인플루언서만 가능)
    function distributeRevenue() external {
        require(msg.sender == influencer, "Only influencer can distribute revenue");
        require(address(this).balance > 0, "No revenue to distribute");
        
        uint256 totalBalance = address(this).balance;
        
        for (uint i = 0; i < revenueRecipients.length; i++) {
            address recipient = revenueRecipients[i];
            uint256 share = revenueShares[recipient];
            
            if (share > 0) {
                uint256 amount = (totalBalance * share) / 10000; // basis points (10000 = 100%)
                if (amount > 0) {
                    payable(recipient).transfer(amount);
                    emit RevenueDistributed(recipient, amount);
                }
            }
        }
    }
    
    // 메타데이터 URI 설정
    function setBaseTokenURI(string memory _baseTokenURI) external onlyOwner {
        baseTokenURI = _baseTokenURI;
    }
    
    // 토큰 URI 조회
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(tokenExists[tokenId], "Token does not exist");
        
        if (bytes(baseTokenURI).length > 0) {
            return string(abi.encodePacked(baseTokenURI, tokenId.toString()));
        }
        
        return projectImageURI; // 기본값으로 프로젝트 이미지 반환
    }
    
    // 프로젝트 정보 조회
    function getProjectInfo() external view returns (
        address _influencer,
        string memory _projectName,
        string memory _productDescription,
        uint256 _totalSupply,
        uint256 _soldCount,
        uint256 _salePrice,
        bool _isActive,
        string memory _projectImageURI
    ) {
        return (
            influencer,
            projectName,
            productDescription,
            totalSupply,
            soldCount,
            salePrice,
            isActive,
            projectImageURI
        );
    }
    
    // IPNFT 참조 정보 조회
    function getIPNFTReferences() external view returns (
        uint256 _brandIPNFTTokenId,
        uint256[] memory _artistIPNFTTokenIds
    ) {
        return (brandIPNFTTokenId, artistIPNFTTokenIds);
    }
    
    // 수익 분배 정보 조회
    function getRevenueShares() external view returns (
        address[] memory _recipients,
        uint256[] memory _shares
    ) {
        uint256[] memory shares = new uint256[](revenueRecipients.length);
        for (uint i = 0; i < revenueRecipients.length; i++) {
            shares[i] = revenueShares[revenueRecipients[i]];
        }
        return (revenueRecipients, shares);
    }
    
    // 긴급 상황 시 수익 인출 (인플루언서만)
    function emergencyWithdraw() external {
        require(msg.sender == influencer, "Only influencer can withdraw");
        payable(influencer).transfer(address(this).balance);
    }
    
    // 컨트랙트 소유자 변경 (인플루언서로)
    function transferOwnership(address newOwner) public virtual override onlyOwner {
        require(newOwner == influencer, "Can only transfer to influencer");
        super.transferOwnership(newOwner);
    }
}
