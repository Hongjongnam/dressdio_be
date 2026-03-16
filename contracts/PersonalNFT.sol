// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IIPNFT.sol";

/**
 * @title PersonalNFT
 * @notice 사용자가 브랜드 IP NFT와 아티스트 IP NFT를 결합하여 커스텀 NFT를 구매할 수 있는 컨트랙트
 * @dev 인플루언서 없이 사용자가 직접 IP NFT를 선택하여 Personal NFT 생성
 */
contract PersonalNFT is ERC721, Ownable {
    // ==========================================
    // 상태 변수
    // ==========================================
    
    IIPNFT public ipnftContract;
    // 기존에는 KRW 토큰을 사용했으나, DressDio 플랫폼에서는 Besu 네트워크의 DP 토큰으로 결제/분배를 수행한다.
    IERC20 public dpToken;
    
    uint256 private _nextTokenId = 1;
    uint256 public nextRequestId = 0;
    
    // 플랫폼 수수료 관련 (basis points: 100 = 1%, 최대 1000 = 10%)
    uint256 public brandFeePercentage = 100;  // 브랜드 role 기본값
    uint256 public artistFeePercentage = 100; // 아티스트 role 기본값
    uint256 public cancelFeePercentage = 100; // 구매 취소 기본값
    address public platformFeeCollector;

    // 크리에이터 주소별 개별 수수료 (설정된 경우 role 기본값보다 우선 적용)
    mapping(address => uint256) public creatorFeePercentage;
    mapping(address => bool) public hasCustomFee;
    
    // ==========================================
    // 구조체
    // ==========================================
    
    /**
     * @notice 구매 요청 정보
     */
    struct PurchaseRequest {
        address buyer;              // 구매자 주소
        uint256 brandTokenId;       // 브랜드 IP NFT 토큰 ID
        uint256[] artistTokenIds;   // 아티스트 IP NFT 토큰 ID 배열
        uint256 totalAmount;        // 총 지불 금액 (DP)
        uint256 timestamp;          // 구매 요청 시간
        bool isConfirmed;           // 구매 확정 여부
        bool isCancelled;           // 취소 여부
        uint256 nftTokenId;         // 발행된 NFT 토큰 ID (확정 후)
    }
    
    // ==========================================
    // 매핑
    // ==========================================
    
    mapping(uint256 => PurchaseRequest) public purchaseRequests;
    mapping(uint256 => string) private _tokenURIs;
    mapping(address => uint256[]) public userRequests; // 사용자별 구매 요청 목록
    
    // ==========================================
    // 이벤트
    // ==========================================
    
    event PurchaseRequested(
        uint256 indexed requestId,
        address indexed buyer,
        uint256 brandTokenId,
        uint256[] artistTokenIds,
        uint256 totalAmount
    );
    
    event PurchaseConfirmed(
        uint256 indexed requestId,
        address indexed buyer,
        uint256 nftTokenId
    );
    
    event PurchaseCancelled(
        uint256 indexed requestId,
        address indexed buyer,
        uint256 refundAmount,
        uint256 platformFee
    );
    
    event FundsDistributed(
        uint256 indexed requestId,
        uint256 indexed nftTokenId,
        address brandOwner,
        uint256 brandAmount,
        address[] artistOwners,
        uint256[] artistAmounts,
        address platformFeeCollector,
        uint256 platformFee,
        uint256 timestamp
    );
    
    event PlatformFeeUpdated(string role, uint256 oldFee, uint256 newFee);
    event PlatformFeeCollectorUpdated(address oldCollector, address newCollector);
    event CreatorFeeSet(address indexed creator, uint256 feePercentage);
    event CreatorFeeRemoved(address indexed creator);
    
    // ==========================================
    // 생성자
    // ==========================================
    
    constructor(
        address _ipnftContract,
        address _dpToken
    ) ERC721("PersonalNFT", "PNFT") Ownable(msg.sender) {
        require(_ipnftContract != address(0), "Invalid IPNFT contract address");
        require(_dpToken != address(0), "Invalid DP token address");
        
        ipnftContract = IIPNFT(_ipnftContract);
        dpToken = IERC20(_dpToken);
        platformFeeCollector = msg.sender;
    }
    
    // ==========================================
    // 주요 함수
    // ==========================================
    
    /**
     * @notice 구매 요청 생성
     * @dev 사용자가 브랜드와 아티스트 IP NFT를 선택하여 구매 요청
     * @param brandTokenId 브랜드 IP NFT 토큰 ID
     * @param artistTokenIds 아티스트 IP NFT 토큰 ID 배열
     * @return requestId 생성된 구매 요청 ID
     */
    function requestPurchase(
        uint256 brandTokenId,
        uint256[] memory artistTokenIds
    ) external returns (uint256 requestId) {
        // 유효성 검사
        require(artistTokenIds.length >= 1, "At least one artist required");
        require(artistTokenIds.length <= 10, "Max 10 artists allowed");
        
        // 브랜드 IP NFT 존재 여부 확인
        IIPNFT.TokenInfo memory brandInfo = ipnftContract.getTokenInfo(brandTokenId);
        require(brandInfo.creator != address(0), "Brand IPNFT does not exist");
        
        // 총 가격 계산
        uint256 totalAmount = _calculateTotalPrice(brandTokenId, artistTokenIds);
        require(totalAmount > 0, "Total amount must be greater than 0");
        
        // DP 토큰을 컨트랙트로 전송 (에스크로)
        require(
            dpToken.transferFrom(msg.sender, address(this), totalAmount),
            "DP transfer failed"
        );
        
        // 구매 요청 저장
        requestId = nextRequestId++;
        purchaseRequests[requestId] = PurchaseRequest({
            buyer: msg.sender,
            brandTokenId: brandTokenId,
            artistTokenIds: artistTokenIds,
            totalAmount: totalAmount,
            timestamp: block.timestamp,
            isConfirmed: false,
            isCancelled: false,
            nftTokenId: 0
        });
        
        // 사용자별 요청 목록에 추가
        userRequests[msg.sender].push(requestId);
        
        emit PurchaseRequested(
            requestId,
            msg.sender,
            brandTokenId,
            artistTokenIds,
            totalAmount
        );
        
        return requestId;
    }
    
    /**
     * @notice 구매 확정 (NFT 발행 + 수익 분배)
     * @dev 구매자가 확정하면 NFT 발행 및 수익 분배 실행
     * @param requestId 구매 요청 ID
     * @param _tokenURI NFT 메타데이터 URI
     */
    function confirmPurchase(
        uint256 requestId,
        string memory _tokenURI
    ) external {
        PurchaseRequest storage request = purchaseRequests[requestId];
        
        // 유효성 검사
        require(msg.sender == request.buyer, "Only buyer can confirm");
        require(!request.isConfirmed, "Already confirmed");
        require(!request.isCancelled, "Already cancelled");
        require(bytes(_tokenURI).length > 0, "Token URI is required");
        
        // NFT 발행
        uint256 tokenId = _nextTokenId++;
        _safeMint(request.buyer, tokenId);
        _tokenURIs[tokenId] = _tokenURI;
        
        // 구매 요청 상태 업데이트
        request.isConfirmed = true;
        request.nftTokenId = tokenId;
        
        // 수익 분배 (에스크로 해제)
        _distributeFunds(requestId, tokenId, request.brandTokenId, request.artistTokenIds);
        
        emit PurchaseConfirmed(requestId, request.buyer, tokenId);
    }
    
    /**
     * @notice 구매 취소 (환불 - 플랫폼 수수료)
     * @dev 구매자가 구매 확정 전에 취소 가능
     * @param requestId 구매 요청 ID
     */
    function cancelPurchase(uint256 requestId) external {
        PurchaseRequest storage request = purchaseRequests[requestId];
        
        // 유효성 검사
        require(msg.sender == request.buyer, "Only buyer can cancel");
        require(!request.isConfirmed, "Already confirmed");
        require(!request.isCancelled, "Already cancelled");
        
        request.isCancelled = true;
        
        // 플랫폼 수수료 차감 후 환불
        uint256 platformFee = (request.totalAmount * cancelFeePercentage) / 10000;
        uint256 refundAmount = request.totalAmount - platformFee;
        
        // 환불 금액이 0보다 클 때만 전송
        if (refundAmount > 0) {
            require(
                dpToken.transfer(request.buyer, refundAmount),
                "Refund failed"
            );
        }
        
        // 플랫폼 수수료가 0보다 클 때만 전송
        if (platformFee > 0) {
            require(
                dpToken.transfer(platformFeeCollector, platformFee),
                "Platform fee transfer failed"
            );
        }
        
        emit PurchaseCancelled(requestId, request.buyer, refundAmount, platformFee);
    }
    
    // ==========================================
    // 내부 함수
    // ==========================================
    
    /**
     * @notice 총 가격 계산
     * @dev 브랜드 가격 + 모든 아티스트 가격의 합
     * @param brandTokenId 브랜드 IP NFT 토큰 ID
     * @param artistTokenIds 아티스트 IP NFT 토큰 ID 배열
     * @return 총 가격
     */
    function _calculateTotalPrice(
        uint256 brandTokenId,
        uint256[] memory artistTokenIds
    ) private view returns (uint256) {
        // Brand 가격
        IIPNFT.TokenInfo memory brandInfo = ipnftContract.getTokenInfo(brandTokenId);
        uint256 totalPrice = brandInfo.price;
        
        // Artist 가격들 합산
        for (uint i = 0; i < artistTokenIds.length; i++) {
            IIPNFT.TokenInfo memory artistInfo = ipnftContract.getTokenInfo(artistTokenIds[i]);
            require(artistInfo.creator != address(0), "Artist IPNFT does not exist");
            totalPrice += artistInfo.price;
        }
        
        return totalPrice;
    }
    
    /**
     * @notice 수익 분배
     * @dev 브랜드, 아티스트, 플랫폼에게 DP 토큰 분배
     * @param requestId 구매 요청 ID
     * @param nftTokenId 발행된 NFT 토큰 ID
     * @param brandTokenId 브랜드 IP NFT 토큰 ID
     * @param artistTokenIds 아티스트 IP NFT 토큰 ID 배열
     */
    function _distributeFunds(
        uint256 requestId,
        uint256 nftTokenId,
        uint256 brandTokenId,
        uint256[] memory artistTokenIds
    ) private {
        // 분배 데이터 수집용 변수
        address[] memory artistOwners = new address[](artistTokenIds.length);
        uint256[] memory artistAmounts = new uint256[](artistTokenIds.length);
        uint256 totalPlatformFee = 0;
        
        // 1. 브랜드 분배
        IIPNFT.TokenInfo memory brandInfo = ipnftContract.getTokenInfo(brandTokenId);
        uint256 brandPrice = brandInfo.price;
        address brandOwner = brandInfo.owner;
        uint256 brandNetAmount = 0;
        
        if (brandPrice > 0 && brandOwner != address(0)) {
            uint256 fee = _resolveCreatorFee(brandOwner, brandFeePercentage);
            uint256 brandFee = (brandPrice * fee) / 10000;
            uint256 brandNet = brandPrice - brandFee;
            brandNetAmount = brandNet;
            totalPlatformFee += brandFee;
            
            require(dpToken.transfer(brandOwner, brandNet), "Brand payment failed");
            
            if (brandFee > 0) {
                require(dpToken.transfer(platformFeeCollector, brandFee), "Platform fee (brand) failed");
            }
        }
        
        // 2. 아티스트들 분배
        for (uint i = 0; i < artistTokenIds.length; i++) {
            IIPNFT.TokenInfo memory artistInfo = ipnftContract.getTokenInfo(artistTokenIds[i]);
            uint256 artistPrice = artistInfo.price;
            address artistOwner = artistInfo.owner;
            
            artistOwners[i] = artistOwner;
            
            if (artistPrice > 0 && artistOwner != address(0)) {
                uint256 fee = _resolveCreatorFee(artistOwner, artistFeePercentage);
                uint256 artistFee = (artistPrice * fee) / 10000;
                uint256 artistNet = artistPrice - artistFee;
                artistAmounts[i] = artistNet;
                totalPlatformFee += artistFee;
                
                require(dpToken.transfer(artistOwner, artistNet), "Artist payment failed");
                
                if (artistFee > 0) {
                    require(dpToken.transfer(platformFeeCollector, artistFee), "Platform fee (artist) failed");
                }
            } else {
                artistAmounts[i] = 0;
            }
        }
        
        // 3. 정산 이벤트 발행
        emit FundsDistributed(
            requestId,
            nftTokenId,
            brandOwner,
            brandNetAmount,
            artistOwners,
            artistAmounts,
            platformFeeCollector,
            totalPlatformFee,
            block.timestamp
        );
    }
    
    // ==========================================
    // 조회 함수
    // ==========================================
    
    /**
     * @notice TokenURI 조회
     * @param tokenId 토큰 ID
     * @return 토큰 URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _tokenURIs[tokenId];
    }
    
    /**
     * @notice 구매 요청 정보 조회
     * @param requestId 구매 요청 ID
     * @return 구매 요청 정보
     */
    function getPurchaseRequest(uint256 requestId) 
        external 
        view 
        returns (PurchaseRequest memory) 
    {
        return purchaseRequests[requestId];
    }
    
    /**
     * @notice 사용자별 구매 요청 목록 조회
     * @param user 사용자 주소
     * @return 구매 요청 ID 배열
     */
    function getUserRequests(address user) external view returns (uint256[] memory) {
        return userRequests[user];
    }
    
    /**
     * @notice 구매 가격 미리 계산
     * @param brandTokenId 브랜드 IP NFT 토큰 ID
     * @param artistTokenIds 아티스트 IP NFT 토큰 ID 배열
     * @return 총 가격
     */
    function calculatePrice(
        uint256 brandTokenId,
        uint256[] memory artistTokenIds
    ) external view returns (uint256) {
        return _calculateTotalPrice(brandTokenId, artistTokenIds);
    }
    
    /**
     * @notice 토큰 존재 여부 확인
     * @param tokenId 토큰 ID
     * @return 존재 여부
     */
    function exists(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
    
    /**
     * @notice 현재 발행된 총 토큰 수 조회
     * @return 총 토큰 수
     */
    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }
    
    /**
     * @notice 총 구매 요청 수 조회
     * @return 총 구매 요청 수
     */
    function totalRequests() external view returns (uint256) {
        return nextRequestId;
    }
    
    // ==========================================
    // 관리자 함수
    // ==========================================
    
    // 크리에이터 주소 → 개별 수수료 조회 (없으면 role 기본값 반환)
    function _resolveCreatorFee(address creator, uint256 roleDefault) internal view returns (uint256) {
        return hasCustomFee[creator] ? creatorFeePercentage[creator] : roleDefault;
    }

    // 크리에이터 개별 수수료 설정 (소유자만)
    function setCreatorFee(address creator, uint256 feePercentage) external onlyOwner {
        require(creator != address(0), "Invalid creator address");
        require(feePercentage <= 1000, "Fee cannot exceed 10%");
        creatorFeePercentage[creator] = feePercentage;
        hasCustomFee[creator] = true;
        emit CreatorFeeSet(creator, feePercentage);
    }

    // 크리에이터 개별 수수료 제거 → role 기본값으로 복귀
    function removeCreatorFee(address creator) external onlyOwner {
        hasCustomFee[creator] = false;
        creatorFeePercentage[creator] = 0;
        emit CreatorFeeRemoved(creator);
    }

    // 크리에이터의 실제 적용 수수료 조회 (role 명시 필요: "brand"|"artist")
    function getEffectiveCreatorFee(address creator, string memory role) external view returns (
        uint256 effectiveFee,
        bool isCustom
    ) {
        if (hasCustomFee[creator]) {
            return (creatorFeePercentage[creator], true);
        }
        bytes32 roleHash = keccak256(bytes(role));
        uint256 roleDefault = (roleHash == keccak256(bytes("artist"))) ? artistFeePercentage : brandFeePercentage;
        return (roleDefault, false);
    }

    // 역할별 플랫폼 수수료 설정 (소유자만, role: "brand"|"artist"|"cancel")
    function setPlatformFeePercentage(string memory role, uint256 newFeePercentage) external onlyOwner {
        require(newFeePercentage <= 1000, "Fee cannot exceed 10%");
        bytes32 roleHash = keccak256(bytes(role));
        if (roleHash == keccak256(bytes("brand"))) {
            uint256 old = brandFeePercentage;
            brandFeePercentage = newFeePercentage;
            emit PlatformFeeUpdated("brand", old, newFeePercentage);
        } else if (roleHash == keccak256(bytes("artist"))) {
            uint256 old = artistFeePercentage;
            artistFeePercentage = newFeePercentage;
            emit PlatformFeeUpdated("artist", old, newFeePercentage);
        } else if (roleHash == keccak256(bytes("cancel"))) {
            uint256 old = cancelFeePercentage;
            cancelFeePercentage = newFeePercentage;
            emit PlatformFeeUpdated("cancel", old, newFeePercentage);
        } else {
            revert("Invalid role. Use: brand, artist, cancel");
        }
    }

    // 모든 수수료 한번에 조회
    function getAllFeePercentages() external view returns (
        uint256 _brandFee,
        uint256 _artistFee,
        uint256 _cancelFee
    ) {
        return (brandFeePercentage, artistFeePercentage, cancelFeePercentage);
    }

    /**
     * @notice 플랫폼 수수료 수취 주소 설정
     * @dev 소유자만 호출 가능
     * @param newCollector 새로운 수수료 수취 주소
     */
    function setPlatformFeeCollector(address newCollector) external onlyOwner {
        require(newCollector != address(0), "Invalid collector address");
        address oldCollector = platformFeeCollector;
        platformFeeCollector = newCollector;
        emit PlatformFeeCollectorUpdated(oldCollector, newCollector);
    }
}

