// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

interface IRecourse {
    event JobAwarded(uint64 jobId, address winner, string reason);

    event JobCreated(uint64 jobId, address requester, uint128 maxPriceWei, uint128 escrowWei);

    event ProviderRegistered(address provider, uint128 bondWei);

    event QuoteSubmitted(uint64 jobId, address provider, uint128 priceWei, uint32 promisedLatencyMs);

    event JobExpired(uint64 jobId);

    event JobSettled(uint64 jobId, uint32 paid, uint128 paidWei, uint128 refundedWei, uint128 slashedWei);

    event ReceiptSubmitted(uint64 jobId, uint8[32] outputHash);

    event VerdictSubmitted(uint64 jobId, uint32 pass);

    function create(bool _callReply, address verifier, uint128 bondWei, uint128 slashWei, uint32 slashToRequesterBps) external returns (bytes32 messageId);

    function marketAwardJob(bool _callReply, uint64 jobId) external returns (bytes32 messageId);

    function marketCreateJob(bool _callReply, uint128 maxPriceWei, uint32 deadlineSecs, string calldata verifierKind, uint8[32] calldata criteriaHash, string calldata policy, uint32 quoteWindowSecs) external payable returns (bytes32 messageId);

    function marketRegisterProvider(bool _callReply) external payable returns (bytes32 messageId);

    function marketStartJob(bool _callReply, uint64 jobId) external returns (bytes32 messageId);

    function marketSubmitQuote(bool _callReply, uint64 jobId, uint128 priceWei, uint32 promisedLatencyMs) external returns (bytes32 messageId);

    function marketTopUpBond(bool _callReply) external payable returns (bytes32 messageId);

    function marketWithdrawBond(bool _callReply) external returns (bytes32 messageId);

    function settlementExpireJob(bool _callReply, uint64 jobId) external returns (bytes32 messageId);

    function settlementGetRetainedWei(bool _callReply) external returns (bytes32 messageId);
}

contract RecourseAbi is IRecourse {
    function create(bool _callReply, address verifier, uint128 bondWei, uint128 slashWei, uint32 slashToRequesterBps) external returns (bytes32 messageId) {}

    function marketAwardJob(bool _callReply, uint64 jobId) external returns (bytes32 messageId) {}

    function marketCreateJob(bool _callReply, uint128 maxPriceWei, uint32 deadlineSecs, string calldata verifierKind, uint8[32] calldata criteriaHash, string calldata policy, uint32 quoteWindowSecs) external payable returns (bytes32 messageId) {}

    function marketRegisterProvider(bool _callReply) external payable returns (bytes32 messageId) {}

    function marketStartJob(bool _callReply, uint64 jobId) external returns (bytes32 messageId) {}

    function marketSubmitQuote(bool _callReply, uint64 jobId, uint128 priceWei, uint32 promisedLatencyMs) external returns (bytes32 messageId) {}

    function marketTopUpBond(bool _callReply) external payable returns (bytes32 messageId) {}

    function marketWithdrawBond(bool _callReply) external returns (bytes32 messageId) {}

    function settlementExpireJob(bool _callReply, uint64 jobId) external returns (bytes32 messageId) {}

    function settlementGetRetainedWei(bool _callReply) external returns (bytes32 messageId) {}
}

interface IRecourseCallbacks {
    function replyOn_create(bytes32 messageId) external;

    function replyOn_marketAwardJob(bytes32 messageId) external;

    function replyOn_marketCreateJob(bytes32 messageId, uint64 reply) external;

    function replyOn_marketRegisterProvider(bytes32 messageId) external;

    function replyOn_marketStartJob(bytes32 messageId) external;

    function replyOn_marketSubmitQuote(bytes32 messageId) external;

    function replyOn_marketTopUpBond(bytes32 messageId, uint128 reply) external;

    function replyOn_marketWithdrawBond(bytes32 messageId, uint128 reply) external payable;

    function replyOn_settlementExpireJob(bytes32 messageId) external;

    function replyOn_settlementGetRetainedWei(bytes32 messageId, uint128 reply) external;

    function onErrorReply(bytes32 messageId, bytes calldata payload, bytes4 replyCode) external payable;
}

contract RecourseCaller is IRecourseCallbacks {
    IRecourse public immutable VARA_ETH_PROGRAM;

    error UnauthorizedCaller();

    constructor(IRecourse _varaEthProgram) {
        VARA_ETH_PROGRAM = _varaEthProgram;
    }

    modifier onlyVaraEthProgram() {
        _onlyVaraEthProgram();
        _;
    }

    function _onlyVaraEthProgram() internal view {
        if (msg.sender != address(VARA_ETH_PROGRAM)) {
            revert UnauthorizedCaller();
        }
    }

    function replyOn_create(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_marketAwardJob(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_marketCreateJob(bytes32 messageId, uint64 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_marketRegisterProvider(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_marketStartJob(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_marketSubmitQuote(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_marketTopUpBond(bytes32 messageId, uint128 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_marketWithdrawBond(bytes32 messageId, uint128 reply) external payable onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_settlementExpireJob(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_settlementGetRetainedWei(bytes32 messageId, uint128 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function onErrorReply(bytes32 messageId, bytes calldata payload, bytes4 replyCode) external payable onlyVaraEthProgram {
        // TODO: implement this
    }
}
