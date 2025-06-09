// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract CreatorSBT is ERC721, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    // 지갑주소 + 타입 조합으로 중복 발행 방지
    mapping(address => mapping(string => bool)) public hasSbt;
    
    // 토큰 ID => 크리에이터 타입
    mapping(uint256 => string) public tokenTypes;
    
    // 토큰 ID => 설명
    mapping(uint256 => string) public tokenDescriptions;
    
    // 토큰 ID => URI
    mapping(uint256 => string) private _tokenURIs;

    // 토큰 ID => 사용 횟수
    mapping(uint256 => uint256) public useCount;

    // 크리에이터 타입 정의
    string[] public creatorTypes = ["brand", "artist", "influencer"];

    // SBT 정보를 담는 구조체
    struct SBTInfo {
        uint256 tokenId;
        address owner;
        string creatorType;
        string description;
        string tokenUri;
        uint256 useCount;
    }

    constructor() ERC721("Creator SBT", "CSBT") Ownable(msg.sender) {}

    // 크리에이터 타입 유효성 검사
    modifier validCreatorType(string memory _type) {
        bool isValid = false;
        for(uint i = 0; i < creatorTypes.length; i++) {
            if(keccak256(bytes(creatorTypes[i])) == keccak256(bytes(_type))) {
                isValid = true;
                break;
            }
        }
        require(isValid, "Invalid creator type");
        _;
    }

    // SBT 발행
    function mint(
        address _to,
        string memory _creatorType,
        string memory _description,
        string memory _tokenUri
    ) external onlyOwner validCreatorType(_creatorType) {
        // 중복 발행 체크
        require(!hasSbt[_to][_creatorType], "SBT already exists for this address and type");

        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();

        // 토큰 발행 및 URI 설정
        _safeMint(_to, newTokenId);
        _setTokenURI(newTokenId, _tokenUri);
        
        // 메타데이터 저장
        tokenTypes[newTokenId] = _creatorType;
        tokenDescriptions[newTokenId] = _description;
        hasSbt[_to][_creatorType] = true;
        useCount[newTokenId] = 0;
    }

    // URI 설정
    function _setTokenURI(uint256 tokenId, string memory _tokenURI) internal {
        try this.ownerOf(tokenId) returns (address) {
            _tokenURIs[tokenId] = _tokenURI;
        } catch {
            revert("URI set of nonexistent token");
        }
    }

    // URI 조회
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        try this.ownerOf(tokenId) returns (address) {
            return _tokenURIs[tokenId];
        } catch {
            revert("URI query for nonexistent token");
        }
    }

    // SBT는 전송 불가능하도록 오버라이드
    function transferFrom(
        address /* from */,
        address /* to */,
        uint256 /* tokenId */
    ) public pure override {
        revert("SBT cannot be transferred");
    }

    // 크리에이터 타입별 SBT 보유 여부 확인
    function hasCreatorSbt(address _address, string memory _type) 
        external 
        view 
        validCreatorType(_type) 
        returns (bool) 
    {
        return hasSbt[_address][_type];
    }

    // 토큰 ID로 크리에이터 타입 조회
    function getCreatorType(uint256 _tokenId) external view returns (string memory) {
        try this.ownerOf(_tokenId) returns (address) {
            return tokenTypes[_tokenId];
        } catch {
            revert("Token does not exist");
        }
    }

    // 토큰 ID로 설명 조회
    function getDescription(uint256 _tokenId) external view returns (string memory) {
        try this.ownerOf(_tokenId) returns (address) {
            return tokenDescriptions[_tokenId];
        } catch {
            revert("Token does not exist");
        }
    }

    // 현재까지 발행된 총 수량 반환
    function totalSupply() external view returns (uint256) {
        return _tokenIds.current();
    }

    // 토큰 ID로 SBT 정보 조회
    function getSBTInfoById(uint256 _tokenId) external view returns (SBTInfo memory) {
        try this.ownerOf(_tokenId) returns (address owner) {
            return SBTInfo({
                tokenId: _tokenId,
                owner: owner,
                creatorType: tokenTypes[_tokenId],
                description: tokenDescriptions[_tokenId],
                tokenUri: _tokenURIs[_tokenId],
                useCount: useCount[_tokenId]
            });
        } catch {
            revert("Token does not exist");
        }
    }

    // 지갑 주소로 SBT 정보 조회
    function getSBTInfoByAddress(address _address) external view returns (SBTInfo[] memory) {
        uint256 count = 0;
        
        // 해당 주소가 보유한 SBT 수 계산
        for (uint256 i = 1; i <= _tokenIds.current(); i++) {
            try this.ownerOf(i) returns (address owner) {
                if (owner == _address) {
                    count++;
                }
            } catch {
                continue;
            }
        }

        // 결과 배열 생성
        SBTInfo[] memory sbtInfos = new SBTInfo[](count);
        uint256 index = 0;

        // SBT 정보 수집
        for (uint256 i = 1; i <= _tokenIds.current(); i++) {
            try this.ownerOf(i) returns (address owner) {
                if (owner == _address) {
                    sbtInfos[index] = SBTInfo({
                        tokenId: i,
                        owner: owner,
                        creatorType: tokenTypes[i],
                        description: tokenDescriptions[i],
                        tokenUri: _tokenURIs[i],
                        useCount: useCount[i]
                    });
                    index++;
                }
            } catch {
                continue;
            }
        }

        return sbtInfos;
    }

    // useCount 증가 함수
    function incrementUseCount(uint256 _tokenId) external {
        require(_exists(_tokenId), "Token does not exist");
        useCount[_tokenId]++;
    }

    // 토큰 존재 여부 확인 (내부 함수)
    function _exists(uint256 tokenId) internal view returns (bool) {
        try this.ownerOf(tokenId) returns (address) {
            return true;
        } catch {
            return false;
        }
    }
}