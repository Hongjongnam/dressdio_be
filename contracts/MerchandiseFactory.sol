// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./PlatformRegistry.sol";
import "./CreatorSBT.sol";

contract MerchandiseFactory is ERC721, Ownable {
    using Strings for uint256;

    PlatformRegistry public platformRegistry;
    CreatorSBT public sbtContract;
    IERC20 public dpToken; // DP 토큰 컨트랙트
    
    // 프로젝트 ID 관리
    uint256 public nextProjectId;
    
    // NFT 메타데이터 관련
    string public baseTokenURI;
    mapping(uint256 => string) public tokenURIs; // 토큰별 메타데이터 URI
    mapping(uint256 => uint256) public tokenToProject; // 토큰 ID -> 프로젝트 ID 매핑
    mapping(uint256 => uint256) public projectToTokenStart; // 프로젝트별 시작 토큰 ID
    uint256 private _nextTokenId; // 다음 토큰 ID
    
    // 프로젝트 정보 구조체
    struct ProjectInfo {
        address influencer;
        string projectName;
        string productDescription;
        uint256 brandIPNFTTokenId;
        uint256[] artistIPNFTTokenIds;
        uint256 totalSupply;
        uint256 salePrice;
        bool isActive;
        uint256 createdAt;
        string projectImageURI;
        uint256 mintedCount; // 현재까지 민팅된 수량
    }
    
    // 구매 요청 정보 구조체
    struct PurchaseRequest {
        address buyer;           // 구매자 주소
        uint256 amount;          // 지불한 DP 금액
        uint256 timestamp;       // 구매 요청 시간
        bool isConfirmed;        // 구매 확정 여부
        bool isCancelled;        // 취소 여부
        uint256 tokenId;         // 발행될 토큰 ID (확정 시)
    }
    
    // 프로젝트 정보 매핑 (projectId 기반)
    mapping(uint256 => ProjectInfo) public projects;
    mapping(address => uint256[]) public influencerProjects; // 인플루언서별 프로젝트 ID 목록
    
    // 에스크로 관련 매핑 (projectId 기반)
    mapping(uint256 => mapping(uint256 => PurchaseRequest)) public purchaseRequests; // projectId => requestId => PurchaseRequest
    mapping(uint256 => uint256) public nextRequestId; // 프로젝트별 다음 요청 ID
    mapping(uint256 => uint256) public projectTotalRequests; // 프로젝트별 총 요청 수
    
    // 플랫폼 수수료 관련
    uint256 public platformFeePercentage = 100; // 1% (100 basis points)
    address public platformFeeCollector; // 플랫폼 수수료 수취 주소
    
    // 이벤트
    event MerchandiseProjectCreated(
        uint256 indexed projectId,
        address indexed influencer,
        string projectName,
        uint256 brandIPNFTTokenId,
        uint256[] artistIPNFTTokenIds,
        uint256 totalSupply,
        uint256 salePrice
    );
    event ProjectActivated(uint256 indexed projectId, bool isActive);
    event PurchaseRequestCreated(
        uint256 indexed projectId,
        uint256 requestId,
        address buyer,
        uint256 amount
    );
    event PurchaseConfirmed(
        uint256 indexed projectId,
        uint256 requestId,
        address buyer,
        uint256 tokenId,
        uint256 amount
    );
    event PurchaseCancelled(
        uint256 indexed projectId,
        uint256 requestId,
        address buyer,
        uint256 refundAmount,
        uint256 platformFee
    );
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event PlatformFeeCollectorUpdated(address oldCollector, address newCollector);
    
    // 디버깅용 이벤트
    event DebugAddress(address brandOwner, address msgSender, uint256 brandTokenId, bool isMatch);

    constructor(
        address _platformRegistry, 
        address _sbtContract,
        address _dpToken
    ) ERC721("MerchandiseFactory", "MCF") Ownable(msg.sender) {
        platformRegistry = PlatformRegistry(_platformRegistry);
        sbtContract = CreatorSBT(_sbtContract);
        dpToken = IERC20(_dpToken);
        platformFeeCollector = msg.sender; // 초기에는 배포자가 수수료 수취
        nextProjectId = 0; // 프로젝트 ID는 0부터 시작
    }

    // 인플루언서 SBT 검증
    modifier onlyInfluencer() {
        require(
            sbtContract.hasCreatorSbt(msg.sender, "influencer"),
            "Only influencers can create merchandise projects"
        );
        _;
    }
    
    // 프로젝트 인플루언서 검증
    modifier onlyProjectInfluencer(uint256 projectId) {
        ProjectInfo storage project = projects[projectId];
        require(project.influencer == msg.sender, "Only project influencer can perform this action");
        _;
    }
    
    // 프로젝트 존재 여부 검증
    modifier projectExists(uint256 projectId) {
        require(projects[projectId].influencer != address(0), "Project does not exist");
        _;
    }
    
    // 구매 요청 존재 여부 검증
    modifier validPurchaseRequest(uint256 projectId, uint256 requestId) {
        require(purchaseRequests[projectId][requestId].buyer != address(0), "Purchase request does not exist");
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
        string memory projectName,
        string memory productDescription,
        uint256 totalSupply,
        uint256 salePrice,
        uint256 brandIPNFTTokenId,
        uint256[] memory artistIPNFTTokenIds,
        string memory projectImageURI
    ) external onlyInfluencer returns (uint256) {
        require(totalSupply > 0, "Total supply must be greater than 0");
        require(salePrice > 0, "Sale price must be greater than 0");
        require(brandIPNFTTokenId >= 0, "Brand IPNFT token ID is required");
        require(artistIPNFTTokenIds.length > 0, "At least one artist IPNFT is required");
        require(bytes(projectName).length > 0, "Project name is required");
        require(bytes(productDescription).length > 0, "Product description is required");
        require(bytes(projectImageURI).length > 0, "Project image URI is required");
        
        // IPNFT 컨트랙트 주소 조회
        address ipnftFactoryAddr = platformRegistry.ipnftFactory();
        address ipnftContractAddr = address(0);
        if (ipnftFactoryAddr != address(0)) {
            ipnftContractAddr = IIPNFTFactory(ipnftFactoryAddr).getIPNFTAddress();
        }
        
        // IPNFT 검증 (실제 구현에서는 IPNFT Factory와 연동)
        // validIPNFT(brandIPNFTTokenId);
        // for (uint i = 0; i < artistIPNFTTokenIds.length; i++) {
        //     validIPNFT(artistIPNFTTokenIds[i]);
        // }
        
        uint256 projectId = nextProjectId++;
        
        // 프로젝트 정보 저장
        projects[projectId] = ProjectInfo({
            influencer: msg.sender,
            projectName: projectName,
            productDescription: productDescription,
            brandIPNFTTokenId: brandIPNFTTokenId,
            artistIPNFTTokenIds: artistIPNFTTokenIds,
            totalSupply: totalSupply,
            salePrice: salePrice,
            isActive: false,
            createdAt: block.timestamp,
            projectImageURI: projectImageURI,
            mintedCount: 0
        });
        
        // 프로젝트별 토큰 ID 범위 설정
        projectToTokenStart[projectId] = _nextTokenId;
        
        // 인플루언서별 프로젝트 목록에 추가
        influencerProjects[msg.sender].push(projectId);
        
        emit MerchandiseProjectCreated(
            projectId,
            msg.sender,
            projectName,
            brandIPNFTTokenId,
            artistIPNFTTokenIds,
            totalSupply,
            salePrice
        );
        
        return projectId;
    }
    
    // 구매 요청 (사용자가 DP로 구매 신청)
    function requestPurchase(uint256 projectId) external returns (uint256 requestId) {
        ProjectInfo storage project = projects[projectId];
        require(project.influencer != address(0), "Project does not exist");
        require(project.isActive, "Project is not active");
        
        require(dpToken.transferFrom(msg.sender, address(this), project.salePrice), "DP payment failed");
        
        requestId = nextRequestId[projectId]++;
        purchaseRequests[projectId][requestId] = PurchaseRequest({
            buyer: msg.sender,
            amount: project.salePrice,
            timestamp: block.timestamp,
            isConfirmed: false,
            isCancelled: false,
            tokenId: 0
        });
        
        projectTotalRequests[projectId]++;
        
        emit PurchaseRequestCreated(projectId, requestId, msg.sender, project.salePrice);
        
        return requestId;
    }
    
    // 구매 확정 (구매자가 확정)
    function confirmPurchase(uint256 projectId, uint256 requestId) 
        external 
        validPurchaseRequest(projectId, requestId)
    {
        PurchaseRequest storage request = purchaseRequests[projectId][requestId];
        require(!request.isConfirmed, "Purchase already confirmed");
        require(!request.isCancelled, "Purchase already cancelled");
        require(msg.sender == request.buyer, "Only buyer can confirm purchase");
        
        ProjectInfo storage project = projects[projectId];
        require(project.mintedCount < project.totalSupply, "All merchandise sold out");
        
        // NFT 민팅을 위한 토큰 ID 계산
        uint256 actualTokenId = projectToTokenStart[projectId] + project.mintedCount;
        project.mintedCount++;
        
        request.isConfirmed = true;
        request.tokenId = actualTokenId;
        
        // NFT 민팅 실행
        _mint(request.buyer, actualTokenId);
        tokenToProject[actualTokenId] = projectId;
        
        // 토큰 메타데이터 URI 설정
        string memory metadataURI = string(abi.encodePacked(
            project.projectImageURI,
            "?tokenId=",
            actualTokenId.toString(),
            "&projectId=",
            projectId.toString()
        ));
        tokenURIs[actualTokenId] = metadataURI;
        
        uint256 totalPrice = request.amount;
        uint256 brandPrice = 0;
        address brandOwner = address(0);
        uint256[] memory artistPrices = new uint256[](project.artistIPNFTTokenIds.length);
        address[] memory artistOwners = new address[](project.artistIPNFTTokenIds.length);
        uint256 artistTotal = 0;
        
        if (project.brandIPNFTTokenId != 0) {
            (
                brandOwner, , , brandPrice, , , , 
            ) = platformRegistry.getIPNFTInfo(project.brandIPNFTTokenId);
        }
        
        for (uint i = 0; i < project.artistIPNFTTokenIds.length; i++) {
            (
                artistOwners[i], , , artistPrices[i], , , , 
            ) = platformRegistry.getIPNFTInfo(project.artistIPNFTTokenIds[i]);
            artistTotal += artistPrices[i];
        }
        
        uint256 influencerMargin = totalPrice;
        if (brandPrice > 0) {
            influencerMargin -= brandPrice;
        }
        influencerMargin -= artistTotal;
        require(influencerMargin >= 0, "Invalid margin");
        
        if (brandPrice > 0 && brandOwner != address(0)) {
            uint256 brandFee = (brandPrice * platformFeePercentage) / 10000; // 1% 수수료
            uint256 brandNet = brandPrice - brandFee;
            require(dpToken.transfer(brandOwner, brandNet), "DP to brand owner failed");
            require(dpToken.transfer(platformFeeCollector, brandFee), "DP to platform (brand) failed");
        }
        
        for (uint i = 0; i < artistOwners.length; i++) {
            if (artistPrices[i] > 0 && artistOwners[i] != address(0)) {
                uint256 artistFee = (artistPrices[i] * platformFeePercentage) / 10000; // 1% 수수료
                uint256 artistNet = artistPrices[i] - artistFee;
                require(dpToken.transfer(artistOwners[i], artistNet), "DP to artist failed");
                require(dpToken.transfer(platformFeeCollector, artistFee), "DP to platform (artist) failed");
            }
        }
        
        if (influencerMargin > 0) {
            uint256 influencerFee = (influencerMargin * platformFeePercentage) / 10000; // 1% 수수료
            uint256 influencerNet = influencerMargin - influencerFee;
            require(dpToken.transfer(project.influencer, influencerNet), "DP to influencer failed");
            require(dpToken.transfer(platformFeeCollector, influencerFee), "DP to platform (influencer) failed");
        }
        
        emit PurchaseConfirmed(projectId, requestId, request.buyer, actualTokenId, request.amount);
    }
    
    // 구매 취소 (구매자 또는 인플루언서가 취소)
    function cancelPurchase(uint256 projectId, uint256 requestId) 
        external 
        validPurchaseRequest(projectId, requestId)
    {
        PurchaseRequest storage request = purchaseRequests[projectId][requestId];
        require(!request.isConfirmed, "Purchase already confirmed");
        require(!request.isCancelled, "Purchase already cancelled");
        
        ProjectInfo storage project = projects[projectId];
        require(
            msg.sender == request.buyer || msg.sender == project.influencer,
            "Only buyer or influencer can cancel purchase"
        );
        
        request.isCancelled = true;
        
        uint256 platformFee = (request.amount * platformFeePercentage) / 10000;
        uint256 refundAmount = request.amount - platformFee;
        
        if (refundAmount > 0) {
            require(
                dpToken.transfer(request.buyer, refundAmount),
                "Failed to refund DP to buyer"
            );
        }
        
        if (platformFee > 0) {
            require(
                dpToken.transfer(platformFeeCollector, platformFee),
                "Failed to transfer platform fee"
            );
        }
        
        emit PurchaseCancelled(projectId, requestId, request.buyer, refundAmount, platformFee);
    }
    
    // 프로젝트 활성화/비활성화 (브랜드 IPNFT 소유자만)
    function setProjectActive(uint256 projectId, bool isActive) external {
        ProjectInfo storage project = projects[projectId];
        require(project.influencer != address(0), "Project does not exist");
        
        address ipnftFactoryAddr = platformRegistry.ipnftFactory();
        address ipnftContractAddr = address(0);
        if (ipnftFactoryAddr != address(0)) {
            ipnftContractAddr = IIPNFTFactory(ipnftFactoryAddr).getIPNFTAddress();
        }
        require(ipnftContractAddr != address(0), "IPNFT contract not found");
        
        IIPNFT ipnftContract = IIPNFT(ipnftContractAddr);
        address brandOwner = ipnftContract.ownerOf(project.brandIPNFTTokenId);
        
        bool isMatch = (brandOwner == msg.sender);
        emit DebugAddress(brandOwner, msg.sender, project.brandIPNFTTokenId, isMatch);
        
        require(
            brandOwner == msg.sender, 
            "Only brand IPNFT owner can set status"
        );
        
        project.isActive = isActive;
        emit ProjectActivated(projectId, isActive);
    }
    
    // 플랫폼 수수료 설정 (소유자만)
    function setPlatformFeePercentage(uint256 newFeePercentage) external onlyOwner {
        require(newFeePercentage <= 1000, "Platform fee cannot exceed 10%");
        uint256 oldFee = platformFeePercentage;
        platformFeePercentage = newFeePercentage;
        emit PlatformFeeUpdated(oldFee, newFeePercentage);
    }
    
    // 플랫폼 수수료 수취 주소 설정 (소유자만)
    function setPlatformFeeCollector(address newCollector) external onlyOwner {
        require(newCollector != address(0), "Invalid collector address");
        address oldCollector = platformFeeCollector;
        platformFeeCollector = newCollector;
        emit PlatformFeeCollectorUpdated(oldCollector, newCollector);
    }
    
    // 구매 요청 정보 조회
    function getPurchaseRequest(uint256 projectId, uint256 requestId) 
        external 
        view 
        returns (PurchaseRequest memory) 
    {
        return purchaseRequests[projectId][requestId];
    }
    
    // 프로젝트별 구매 요청 목록 조회
    function getProjectPurchaseRequests(uint256 projectId) 
        external 
        view 
        returns (uint256[] memory) 
    {
        uint256 totalRequests = projectTotalRequests[projectId];
        uint256[] memory requestIds = new uint256[](totalRequests);
        
        for (uint256 i = 0; i < totalRequests; i++) {
            requestIds[i] = i;
        }
        
        return requestIds;
    }
    
    // 인플루언서별 프로젝트 목록 조회
    function getInfluencerProjects(address influencer) external view returns (uint256[] memory) {
        return influencerProjects[influencer];
    }
    
    // 프로젝트 정보 조회
    function getProjectInfo(uint256 projectId) external view returns (
        address _influencer,
        string memory _projectName,
        string memory _productDescription,
        uint256 _brandIPNFTTokenId,
        uint256[] memory _artistIPNFTTokenIds,
        uint256 _totalSupply,
        uint256 _salePrice,
        bool _isActive,
        uint256 _createdAt,
        string memory _projectImageURI,
        uint256 _mintedCount
    ) {
        ProjectInfo storage project = projects[projectId];
        return (
            project.influencer,
            project.projectName,
            project.productDescription,
            project.brandIPNFTTokenId,
            project.artistIPNFTTokenIds,
            project.totalSupply,
            project.salePrice,
            project.isActive,
            project.createdAt,
            project.projectImageURI,
            project.mintedCount
        );
    }
    
    // 활성화된 프로젝트 목록 조회
    function getActiveProjects() external view returns (uint256[] memory) {
        uint256[] memory activeProjects = new uint256[](nextProjectId);
        uint256 activeCount = 0;
        
        for (uint i = 0; i < nextProjectId; i++) {
            if (projects[i].isActive) {
                activeProjects[activeCount] = i;
                activeCount++;
            }
        }
        
        // 정확한 크기로 배열 조정
        uint256[] memory result = new uint256[](activeCount);
        for (uint i = 0; i < activeCount; i++) {
            result[i] = activeProjects[i];
        }
        
        return result;
    }
    
    // 프로젝트 수 조회
    function getProjectCount() external view returns (uint256) {
        return nextProjectId;
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
    
    // 토큰 URI 조회
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        
        if (bytes(tokenURIs[tokenId]).length > 0) {
            return tokenURIs[tokenId];
        }
        
        // 기본 URI가 설정되어 있으면 사용
        if (bytes(baseTokenURI).length > 0) {
            return string(abi.encodePacked(baseTokenURI, tokenId.toString()));
        }
        
        // 프로젝트 정보에서 기본 이미지 반환
        uint256 projectId = tokenToProject[tokenId];
        if (projectId < nextProjectId) {
            return projects[projectId].projectImageURI;
    }

        return "";
    }
    
    // 토큰별 프로젝트 ID 조회
    function getTokenProject(uint256 tokenId) external view returns (uint256) {
        require(_exists(tokenId), "Token does not exist");
        return tokenToProject[tokenId];
    }
    
    // 프로젝트별 토큰 시작 ID 조회
    function getProjectTokenStart(uint256 projectId) external view returns (uint256) {
        require(projectId < nextProjectId, "Project does not exist");
        return projectToTokenStart[projectId];
    }
    
    // 기본 URI 설정 (소유자만)
    function setBaseTokenURI(string memory _baseTokenURI) external onlyOwner {
        baseTokenURI = _baseTokenURI;
    }
    
    // 토큰별 URI 설정 (소유자만)
    function setTokenURI(uint256 tokenId, string memory _tokenURI) external onlyOwner {
        require(_exists(tokenId), "Token does not exist");
        tokenURIs[tokenId] = _tokenURI;
    }
    
    // 토큰 존재 여부 확인 (내부 함수)
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
    
    // 토큰 존재 여부 확인 (공개 함수)
    function exists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }
}