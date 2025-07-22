// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./CreatorSBT.sol";
import "./interfaces/IIPNFT.sol"; // IIPNFT 인터페이스 import

contract MerchandiseFactory is ERC721, Ownable {
    using Strings for uint256;

    // PlatformRegistry 대신 IIPNFT 와 CreatorSBT 를 직접 참조
    IIPNFT public ipnftContract;
    CreatorSBT public sbtContract;
    IERC20 public dpToken;
    
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
        uint256 totalArtistContribution; // 아티스트 기여도 총합
        mapping(address => uint256) artistContributions; // 아티스트별 기여도
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
        uint256 indexed requestId,
        address buyer,
        uint256 tokenId // NFT 토큰 ID 추가
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
    event DebugDistribution(
        string role,
        address recipient,
        uint256 beforeBalance,
        uint256 afterBalance,
        uint256 expectedAmount,
        uint256 fee,
        uint256 netAmount
    );
    event DebugRoyaltyCalculation(uint256 totalPrice, uint256 royaltiesTotal, uint256 brandPrice, uint256 artistTotal);
    event DebugStep(string step, uint256 value);
    event DebugLog(string message, uint256 value);
    event DebugLogAddress(string message, address value);
    event DebugLogBool(string message, bool value);
    event DebugMessage(string message);
    /*
    event DebugProjectCreation(
        string projectName,
        uint256 totalSupply,
        uint256 salePrice,
        uint256 brandIPNFTTokenId,
        uint256[] artistIPNFTTokenIds
    );
    */

    // --- 새로운 뷰 함수 ---
    function getArtistIPNFTTokenIdsForProject(uint256 projectId) external view returns (uint256[] memory) {
        return projects[projectId].artistIPNFTTokenIds;
    }


    constructor(
        address _ipnftContract, // IPNFT 주소를 직접 받음
        address _sbtContract,
        address _dpToken
    ) ERC721("MerchandiseFactory", "MCF") Ownable(msg.sender) {
        ipnftContract = IIPNFT(_ipnftContract); // IIPNFT로 인스턴스화
        sbtContract = CreatorSBT(_sbtContract);
        dpToken = IERC20(_dpToken);
        platformFeeCollector = msg.sender;
        nextProjectId = 0;
        _nextTokenId = 1; // 토큰 ID 카운터를 1로 초기화합니다.
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

    // 브랜드 IPNFT 소유자 검증 modifier 수정
    modifier onlyBrandOwnerOfProject(uint256 projectId) {
        ProjectInfo storage project = projects[projectId];
        require(project.influencer != address(0), "Project does not exist");
        
        // ipnftContract를 직접 사용하여 소유자 조회
        address brandOwner = ipnftContract.ownerOf(project.brandIPNFTTokenId);
        
        emit DebugAddress(brandOwner, msg.sender, project.brandIPNFTTokenId, brandOwner == msg.sender);
        
        require(brandOwner == msg.sender, "Only the brand owner can perform this action");
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
        // emit DebugProjectCreation(projectName, totalSupply, salePrice, brandIPNFTTokenId, artistIPNFTTokenIds);

        require(totalSupply > 0, "Total supply must be greater than 0");
        require(salePrice > 0, "Sale price must be greater than 0");
        require(brandIPNFTTokenId >= 0, "Brand IPNFT token ID is required");
        require(artistIPNFTTokenIds.length > 0, "At least one artist IPNFT is required");
        require(bytes(projectName).length > 0, "Project name is required");
        require(bytes(productDescription).length > 0, "Product description is required");
        require(bytes(projectImageURI).length > 0, "Project image URI is required");
        
        uint256 projectId = nextProjectId++;
        
        // 1. 저장 공간을 먼저 확보합니다.
        ProjectInfo storage project = projects[projectId];

        // 2. 기본 정보들을 먼저 채웁니다.
        project.influencer = msg.sender;
        project.projectName = projectName;
        project.productDescription = productDescription;
        project.brandIPNFTTokenId = brandIPNFTTokenId;
        project.artistIPNFTTokenIds = artistIPNFTTokenIds;
        project.totalSupply = totalSupply;
        project.salePrice = salePrice;
        project.isActive = false;
        project.createdAt = block.timestamp;
        project.projectImageURI = projectImageURI;
        project.mintedCount = 0;
        
        // 3. 이제 안전하게 매핑에 값을 채우고, 기여도 합계를 계산합니다.
        uint256 totalArtistPrice = 0;
        emit DebugMessage("Starting to loop through artist tokens");
        for (uint i = 0; i < artistIPNFTTokenIds.length; i++) {
            uint256 currentTokenId = artistIPNFTTokenIds[i];
            emit DebugLog("Processing artist token ID", currentTokenId);

            IIPNFT.TokenInfo memory artistInfo = ipnftContract.getTokenInfo(currentTokenId);
            
            address artistOwner = artistInfo.owner;
            uint256 artistPrice = artistInfo.price;
            
            emit DebugLogAddress("Found artist owner", artistOwner);
            emit DebugLog("Found artist price", artistPrice);

            project.artistContributions[artistOwner] = artistPrice;
            totalArtistPrice += artistPrice;
        }
        emit DebugLog("Finished loop. Total artist price", totalArtistPrice);
        project.totalArtistContribution = totalArtistPrice;
        
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
    
    // 프로젝트 활성화 (브랜드 IPNFT 소유자만 가능)
    function activateProject(uint256 projectId) external projectExists(projectId) onlyBrandOwnerOfProject(projectId) {
        ProjectInfo storage project = projects[projectId];
        require(!project.isActive, "Project is already active");
        
        project.isActive = true;
        
        emit ProjectActivated(projectId, true);
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
    
    // 구매 확정 (구매자만 가능, tokenURI 세팅 지원)
    function confirmPurchase(
        uint256 projectId,
        uint256 requestId,
        string memory _tokenURI
    ) external {
        ProjectInfo storage project = projects[projectId];
        PurchaseRequest storage request = purchaseRequests[projectId][requestId];

        require(msg.sender == request.buyer, "Only the buyer can confirm purchase");
        require(!request.isConfirmed, "Purchase already confirmed");
        require(!request.isCancelled, "Purchase already cancelled");
        require(project.mintedCount < project.totalSupply, "All tokens have been minted");

        // NFT 민팅
        uint256 tokenId = _processPurchase(projectId, requestId, project, request);

        // 구매 요청 상태 업데이트
        request.isConfirmed = true;
        request.tokenId = tokenId;

        // tokenURI 세팅 (구매자가 직접 세팅)
        tokenURIs[tokenId] = _tokenURI;

        emit PurchaseConfirmed(projectId, requestId, request.buyer, tokenId);
    }

    // --- 새로운 내부 함수들 ---

    function _processPurchase(
        uint256 projectId,
        uint256 requestId,
        ProjectInfo storage project,
        PurchaseRequest storage request
    ) private returns (uint256) {
        // 1. NFT 민팅
        uint256 tokenId = _mintMerchandise(request.buyer, projectId, requestId);

        // 2. DP 토큰 분배
        _distributeFunds(projectId, project);

        return tokenId;
    }

    function _mintMerchandise(
        address to,
        uint256 projectId,
        uint256 requestId
    ) private returns (uint256) {
        ProjectInfo storage project = projects[projectId];
        
        // 우리 컨트랙트의 카운터를 사용하여 다음 토큰 ID를 결정합니다.
        uint256 tokenId = _nextTokenId;
        _safeMint(to, tokenId);
        
        // 다음 토큰 ID를 위해 카운터를 1 증가시킵니다.
        _nextTokenId++;

        project.mintedCount++; // mintedCount는 여기서 한번만 증가

        // 토큰과 프로젝트 매핑
        tokenToProject[tokenId] = projectId;
        
        return tokenId;
    }

    function _distributeFunds(uint256 projectId, ProjectInfo storage project) private {
        // ... (기존 분배 로직) ...
        uint256 totalPrice = project.salePrice;

        // 브랜드 정보 조회
        IIPNFT.TokenInfo memory brandInfo = ipnftContract.getTokenInfo(project.brandIPNFTTokenId);
        address brandOwner = brandInfo.owner;
        uint256 brandPrice = brandInfo.price;

        // 아티스트 정보 조회 및 총합 계산
        uint256 artistTotal = project.totalArtistContribution;
        
        // 인플루언서 마진 계산
        uint256 royaltiesTotal = brandPrice + artistTotal;
        require(totalPrice >= royaltiesTotal, "Sale price cannot cover royalties");
        uint256 influencerMargin = totalPrice - royaltiesTotal;
        
        // 브랜드 분배
        if (brandPrice > 0 && brandOwner != address(0)) {
            uint256 brandFee = (brandPrice * platformFeePercentage) / 10000;
            uint256 brandNet = brandPrice - brandFee;
            require(dpToken.transfer(brandOwner, brandNet), "DP to brand owner failed");
            require(dpToken.transfer(platformFeeCollector, brandFee), "DP to platform (brand) failed");
        }
        
        // 아티스트 분배
        for (uint i = 0; i < project.artistIPNFTTokenIds.length; i++) {
            IIPNFT.TokenInfo memory artistInfo = ipnftContract.getTokenInfo(project.artistIPNFTTokenIds[i]);
            address artistOwner = artistInfo.owner;
            uint256 artistPrice = artistInfo.price;

            if (artistPrice > 0 && artistOwner != address(0)) {
                uint256 artistFee = (artistPrice * platformFeePercentage) / 10000;
                uint256 artistNet = artistPrice - artistFee;
                require(dpToken.transfer(artistOwner, artistNet), "DP to artist failed");
                require(dpToken.transfer(platformFeeCollector, artistFee), "DP to platform (artist) failed");
            }
        }
        
        // 인플루언서 분배
        if (influencerMargin > 0) {
            uint256 influencerFee = (influencerMargin * platformFeePercentage) / 10000;
            uint256 influencerNet = influencerMargin - influencerFee;
            require(dpToken.transfer(project.influencer, influencerNet), "DP to influencer failed");
            require(dpToken.transfer(platformFeeCollector, influencerFee), "DP to platform (influencer) failed");
        }
    }


    // 구매 취소 (구매자 또는 인플루언서가 취소 가능)
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
        
        // address ipnftFactoryAddr = platformRegistry.ipnftFactory();
        // address ipnftContractAddr = address(0);
        // if (ipnftFactoryAddr != address(0)) {
        //     ipnftContractAddr = IIPNFTFactory(ipnftFactoryAddr).getIPNFTAddress();
        // }
        // require(ipnftContractAddr != address(0), "IPNFT contract not found");
        
        // IIPNFT ipnftContract = IIPNFT(ipnftContractAddr);
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
        // require(msg.sender == platformRegistry.owner(), "Only platform registry owner can set SBT contract");
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