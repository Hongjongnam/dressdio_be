// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./MerchandiseNFT.sol";
import "./PlatformRegistry.sol";
import "./CreatorSBT.sol";

contract MerchandiseFactory {
    address[] public allMerchandiseNFTs;
    PlatformRegistry public platformRegistry;
    CreatorSBT public sbtContract;
    
    // 프로젝트 정보 구조체
    struct ProjectInfo {
        address merchandiseContract;
        address influencer;
        string projectName;
        uint256 brandIPNFTTokenId;
        uint256[] artistIPNFTTokenIds;
        uint256 totalSupply;
        uint256 salePrice;
        bool isActive;
        uint256 createdAt;
    }
    
    // 프로젝트 정보 매핑
    mapping(address => ProjectInfo) public projects;
    mapping(address => address[]) public influencerProjects; // 인플루언서별 프로젝트 목록
    
    // 이벤트
    event MerchandiseProjectCreated(
        address merchandiseContract,
        address influencer,
        string projectName,
        uint256 brandIPNFTTokenId,
        uint256[] artistIPNFTTokenIds,
        uint256 totalSupply,
        uint256 salePrice
    );
    event ProjectActivated(address merchandiseContract, bool isActive);

    constructor(address _platformRegistry, address _sbtContract) {
        platformRegistry = PlatformRegistry(_platformRegistry);
        sbtContract = CreatorSBT(_sbtContract);
    }
    
    // 인플루언서 SBT 검증
    modifier onlyInfluencer() {
        require(
            sbtContract.hasCreatorSbt(msg.sender, "influencer"),
            "Only influencers can create merchandise projects"
        );
        _;
    }
    
    // IPNFT 존재 여부 검증
    modifier validIPNFT(uint256 tokenId) {
        // IPNFT Factory에서 IPNFT 주소 조회 후 존재 여부 확인
        // (실제 구현에서는 IPNFT Factory와 연동 필요)
        _;
    }

    // Merchandise 프로젝트 생성 (인플루언서만 가능)
    function createMerchandiseProject(
        string memory name,
        string memory symbol,
        string memory projectName,
        string memory productDescription,
        uint256 totalSupply,
        uint256 salePrice,
        uint256 brandIPNFTTokenId,
        uint256[] memory artistIPNFTTokenIds,
        string memory projectImageURI
    ) external onlyInfluencer returns (address) {
        require(totalSupply > 0, "Total supply must be greater than 0");
        require(salePrice > 0, "Sale price must be greater than 0");
        require(brandIPNFTTokenId >= 0, "Brand IPNFT token ID is required");
        require(artistIPNFTTokenIds.length > 0, "At least one artist IPNFT is required");
        require(bytes(projectName).length > 0, "Project name is required");
        require(bytes(productDescription).length > 0, "Product description is required");
        require(bytes(projectImageURI).length > 0, "Project image URI is required");
        
        // IPNFT 검증 (실제 구현에서는 IPNFT Factory와 연동)
        // validIPNFT(brandIPNFTTokenId);
        // for (uint i = 0; i < artistIPNFTTokenIds.length; i++) {
        //     validIPNFT(artistIPNFTTokenIds[i]);
        // }
        
        // MerchandiseNFT 컨트랙트 생성
        MerchandiseNFT nft = new MerchandiseNFT(
            name,
            symbol,
            msg.sender, // influencer
            projectName,
            productDescription,
            totalSupply,
            salePrice,
            brandIPNFTTokenId,
            artistIPNFTTokenIds,
            projectImageURI
        );
        
        address merchandiseAddress = address(nft);
        
        // 프로젝트 정보 저장
        projects[merchandiseAddress] = ProjectInfo({
            merchandiseContract: merchandiseAddress,
            influencer: msg.sender,
            projectName: projectName,
            brandIPNFTTokenId: brandIPNFTTokenId,
            artistIPNFTTokenIds: artistIPNFTTokenIds,
            totalSupply: totalSupply,
            salePrice: salePrice,
            isActive: false,
            createdAt: block.timestamp
        });
        
        // 인플루언서별 프로젝트 목록에 추가
        influencerProjects[msg.sender].push(merchandiseAddress);
        
        // 전체 프로젝트 목록에 추가
        allMerchandiseNFTs.push(merchandiseAddress);
        
        emit MerchandiseProjectCreated(
            merchandiseAddress,
            msg.sender,
            projectName,
            brandIPNFTTokenId,
            artistIPNFTTokenIds,
            totalSupply,
            salePrice
        );
        
        return merchandiseAddress;
    }
    
    // 프로젝트 활성화/비활성화 (인플루언서만)
    function setProjectActive(address merchandiseContract, bool isActive) external {
        ProjectInfo storage project = projects[merchandiseContract];
        require(project.influencer == msg.sender, "Only project influencer can set status");
        
        MerchandiseNFT nft = MerchandiseNFT(merchandiseContract);
        nft.setActive(isActive);
        
        project.isActive = isActive;
        emit ProjectActivated(merchandiseContract, isActive);
    }
    
    // 수익 분배 설정 (인플루언서만)
    function setProjectRevenueShares(
        address merchandiseContract,
        address[] memory recipients,
        uint256[] memory shares
    ) external {
        ProjectInfo storage project = projects[merchandiseContract];
        require(project.influencer == msg.sender, "Only project influencer can set revenue shares");
        
        MerchandiseNFT nft = MerchandiseNFT(merchandiseContract);
        nft.setRevenueShares(recipients, shares);
    }
    
    // 수익 분배 실행 (인플루언서만)
    function distributeProjectRevenue(address merchandiseContract) external {
        ProjectInfo storage project = projects[merchandiseContract];
        require(project.influencer == msg.sender, "Only project influencer can distribute revenue");
        
        MerchandiseNFT nft = MerchandiseNFT(merchandiseContract);
        nft.distributeRevenue();
    }
    
    // 전체 Merchandise 프로젝트 목록 조회
    function getAllMerchandiseNFTs() external view returns (address[] memory) {
        return allMerchandiseNFTs;
    }
    
    // 인플루언서별 프로젝트 목록 조회
    function getInfluencerProjects(address influencer) external view returns (address[] memory) {
        return influencerProjects[influencer];
    }
    
    // 프로젝트 정보 조회
    function getProjectInfo(address merchandiseContract) external view returns (
        address _influencer,
        string memory _projectName,
        uint256 _brandIPNFTTokenId,
        uint256[] memory _artistIPNFTTokenIds,
        uint256 _totalSupply,
        uint256 _salePrice,
        bool _isActive,
        uint256 _createdAt
    ) {
        ProjectInfo storage project = projects[merchandiseContract];
        return (
            project.influencer,
            project.projectName,
            project.brandIPNFTTokenId,
            project.artistIPNFTTokenIds,
            project.totalSupply,
            project.salePrice,
            project.isActive,
            project.createdAt
        );
    }
    
    // 활성화된 프로젝트 목록 조회
    function getActiveProjects() external view returns (address[] memory) {
        address[] memory activeProjects = new address[](allMerchandiseNFTs.length);
        uint256 activeCount = 0;
        
        for (uint i = 0; i < allMerchandiseNFTs.length; i++) {
            if (projects[allMerchandiseNFTs[i]].isActive) {
                activeProjects[activeCount] = allMerchandiseNFTs[i];
                activeCount++;
            }
        }
        
        // 정확한 크기로 배열 조정
        address[] memory result = new address[](activeCount);
        for (uint i = 0; i < activeCount; i++) {
            result[i] = activeProjects[i];
        }
        
        return result;
    }
    
    // 프로젝트 수 조회
    function getProjectCount() external view returns (uint256) {
        return allMerchandiseNFTs.length;
    }
    
    // 인플루언서 프로젝트 수 조회
    function getInfluencerProjectCount(address influencer) external view returns (uint256) {
        return influencerProjects[influencer].length;
    }
    
    // SBT 컨트랙트 주소 설정 (배포 후 필요시 사용)
    function setSBTContract(address _sbtContract) external {
        require(msg.sender == platformRegistry.owner(), "Only platform registry owner can set SBT contract");
        sbtContract = CreatorSBT(_sbtContract);
    }
}