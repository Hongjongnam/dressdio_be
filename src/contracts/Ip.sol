// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

// SBT 컨트랙트 인터페이스
interface ISBT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getCreatorType(uint256 tokenId) external view returns (string memory);
    function getDescription(uint256 tokenId) external view returns (string memory);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

contract IPNFT is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    // SBT 컨트랙트 인터페이스
    ISBT public sbtContract;
    bool public sbtContractSet;

    // IP NFT 메타데이터 구조체
    struct IPNFTData {
        uint256 sbtTokenId;      // 발행자의 SBT 토큰 ID
        string creatorType;      // 발행자 타입 (ARTIST or BRAND)
        string tokenURI;         // IP NFT 메타데이터 URI
        string sbtDescription;   // SBT 설명
        string sbtTokenURI;      // SBT 메타데이터 URI
    }

    // IP NFT 정보를 담는 구조체
    struct IPNFTInfo {
        uint256 tokenId;
        address owner;
        uint256 sbtTokenId;
        string creatorType;
        string tokenURI;
        string sbtDescription;
        string sbtTokenURI;
    }

    // 토큰 ID => IP NFT 데이터 매핑
    mapping(uint256 => IPNFTData) public ipNFTData;

    // SBT 토큰 ID => IP NFT 토큰 ID 배열 매핑
    mapping(uint256 => uint256[]) private sbtToIPNFTs;

    // 이벤트
    event IPNFTMinted(
        uint256 indexed ipNFTTokenId,
        uint256 indexed sbtTokenId,
        address indexed owner,
        string creatorType,
        string tokenURI,
        string sbtDescription,
        string sbtTokenURI
    );

    event SBTContractSet(address indexed sbtContract);

    constructor() ERC721("IP NFT", "IPNFT") Ownable(msg.sender) {
        sbtContractSet = false;
    }

    /**
     * @dev SBT 컨트랙트 주소 설정 함수
     * @param _sbtContractAddress SBT 컨트랙트 주소
     */
    function setSBTContract(address _sbtContractAddress) external onlyOwner {
        require(!sbtContractSet, "SBT contract already set");
        sbtContract = ISBT(_sbtContractAddress);
        sbtContractSet = true;
        emit SBTContractSet(_sbtContractAddress);
    }

    /**
     * @dev IP NFT 발행 함수
     * @param _tokenURI IP NFT 메타데이터 URI
     * @param _sbtTokenId 발행자의 SBT 토큰 ID
     */
    function mintIPNFT(string memory _tokenURI, uint256 _sbtTokenId) public {
        require(sbtContractSet, "SBT contract not set");
        
        // SBT 소지 여부 확인
        require(sbtContract.ownerOf(_sbtTokenId) == msg.sender, "Not SBT owner");
        
        // SBT의 creatorType 확인
        string memory creatorType = sbtContract.getCreatorType(_sbtTokenId);
        require(
            keccak256(bytes(creatorType)) == keccak256(bytes("artist")) ||
            keccak256(bytes(creatorType)) == keccak256(bytes("brand")),
            "Only ARTIST or BRAND can mint IP NFT"
        );

        // SBT 상세 정보 조회
        string memory sbtDescription = sbtContract.getDescription(_sbtTokenId);
        string memory sbtTokenURI = sbtContract.tokenURI(_sbtTokenId);

        // 새로운 토큰 ID 생성
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();

        // IP NFT 발행
        _safeMint(msg.sender, newTokenId);
        _setTokenURI(newTokenId, _tokenURI);

        // IP NFT 데이터 저장
        ipNFTData[newTokenId] = IPNFTData({
            sbtTokenId: _sbtTokenId,
            creatorType: creatorType,
            tokenURI: _tokenURI,
            sbtDescription: sbtDescription,
            sbtTokenURI: sbtTokenURI
        });

        // SBT 토큰 ID와 IP NFT 토큰 ID 매핑 추가
        sbtToIPNFTs[_sbtTokenId].push(newTokenId);

        // 이벤트 발생
        emit IPNFTMinted(
            newTokenId,
            _sbtTokenId,
            msg.sender,
            creatorType,
            _tokenURI,
            sbtDescription,
            sbtTokenURI
        );
    }

    /**
     * @dev IP NFT 데이터 조회 함수
     * @param _tokenId IP NFT 토큰 ID
     */
    function getIPNFTData(uint256 _tokenId) public view returns (
        uint256 sbtTokenId,
        string memory creatorType,
        string memory tokenURI,
        string memory sbtDescription,
        string memory sbtTokenURI
    ) {
        require(_exists(_tokenId), "IP NFT does not exist");
        IPNFTData memory data = ipNFTData[_tokenId];
        return (
            data.sbtTokenId,
            data.creatorType,
            data.tokenURI,
            data.sbtDescription,
            data.sbtTokenURI
        );
    }

    /**
     * @dev SBT 토큰 ID로 IP NFT 목록 조회 함수
     * @param _sbtTokenId SBT 토큰 ID
     * @return IP NFT 토큰 ID 배열
     */
    function getIPNFTsBySBTTokenId(uint256 _sbtTokenId) external view returns (uint256[] memory) {
        return sbtToIPNFTs[_sbtTokenId];
    }

    /**
     * @dev 토큰 존재 여부 확인 함수
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    /**
     * @dev 모든 IP NFT 정보 조회 함수
     * @return IP NFT 정보 배열
     */
    function getAllIPNFTs() external view returns (IPNFTInfo[] memory) {
        uint256 totalTokens = _tokenIds.current();
        uint256 validTokenCount = 0;
        
        // 유효한 토큰 수 계산
        for (uint256 i = 1; i <= totalTokens; i++) {
            if (_exists(i)) {
                validTokenCount++;
            }
        }

        // 결과 배열 생성
        IPNFTInfo[] memory allIPNFTs = new IPNFTInfo[](validTokenCount);
        uint256 index = 0;

        // 모든 IP NFT 정보 수집
        for (uint256 i = 1; i <= totalTokens; i++) {
            if (_exists(i)) {
                IPNFTData memory data = ipNFTData[i];
                allIPNFTs[index] = IPNFTInfo({
                    tokenId: i,
                    owner: ownerOf(i),
                    sbtTokenId: data.sbtTokenId,
                    creatorType: data.creatorType,
                    tokenURI: data.tokenURI,
                    sbtDescription: data.sbtDescription,
                    sbtTokenURI: data.sbtTokenURI
                });
                index++;
            }
        }

        return allIPNFTs;
    }
}
