//Raffle
//enter the lottery(paying some amount)
//pick a random winner(verifiably random)
//winner to be selected every X minute ->completly automated
//chain link oracle ->Randomness,Automated Execution (Chainlink keepers)

//SPDX-Lincense-Identifier:MIT

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.7;
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Raffle__NotEnoughEthEntered();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Rafflle__UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffleState);

contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /*Type declarations */
    enum RaffleState {
        OPEN,
        CALCULATING
    } //what we are actually creating: uint256 0=OPEN ,1=CALCULATING

    /*state variables(both storage and non storage variables in this area)*/
    uint256 private immutable i_entranceFee; //s_=storage variable i_=immutable variable(immutable means this will be used only one time)
    address payable[] private s_players; //list of players in this variable.payable:we need to pay one of these players(winner)
    //s_:it is a storage variable because we will add more and more players in this variable.
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator; //interact with this one time;thus,private immutable
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId; //this is used for the subscription to get the random word.
    uint16 private constant REQUEST_CONFIRMATIONS = 3; //How many blocks do we want to wait before confirmations?Ans:3.
    uint32 private immutable i_callbackGasLimit; //this identifies how much gas we want to spend for our callbackRanodmWords.
    uint32 private constant NUM_WORDS = 1;

    //Lottery Variables
    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    /*Events */
    event RaffleEnter(address indexed players);
    event RequestedRAffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed Winner);

    /*functions */
    constructor(
        address vrfCoordinatorV2, //this is a contract address
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterRaffle() public payable {
        //public:so that anyone can enter .payable:people will send eth
        //require(msg.value>i_entranceFee,"Not enough ETH") becase its not gas efficient
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughEthEntered(); //this is more gas efficient because instead of storing a string,we are only storing a error code
        }
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__NotOpen();
        }
        s_players.push(payable(msg.sender)); //we are making the address of the palyer payable
        //Emit an event when we update a dynamic array or mapping
        //Named events with the function name reversed
        emit RaffleEnter(msg.sender);
    }

    /**
     * @dev This is the function that the Chainlink Keeper nodes call.
     * they look for the "upkeepNeeded" to return true.
     * The following should be true in order to return true:
     * 1.Our time interval should have passed
     * 2.The lottery should have atleast 1 player,and some ETH
     * 3.Our subscription is funded with LINK
     * 4.The lottery should be in an "open" state
     */
    function checkUpkeep(
        bytes memory /* checkData*/
    ) public view override returns (bool upkeepNeeded, bytes memory /*performData */) {
        bool isOpen = (RaffleState.OPEN == s_raffleState);
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        bool hasPlayers = (s_players.length > 0);
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance); //we've already declared what type of data is upkeepdata in the returns bracket.
        //no need to again declare it here.
        return (upkeepNeeded, "0x0");
    }

    function performUpkeep(bytes calldata /*performData*/) external override {
        //Request the random number
        //Once we get it,do something with it
        //2 transaction process
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Rafflle__UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, //gasLane:limit the amount of gas we are willing to pay for the request randomNumber.
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestedRAffleWinner(requestId);
    }

    function fulfillRandomWords(
        uint256 /* requestId*/,
        uint256[] memory randomWords
    ) internal override {
        // s_players size 10
        //randomNumber 202
        //202%10?what doesn't divide evenly into 202?
        //20*10=200
        //remainder:2
        //202%10=2.

        uint256 indexOfWinner = randomWords[0] % s_players.length; //index:0;because,we are only getting one random word.
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        s_raffleState = RaffleState.OPEN;
        s_players = new address payable[](0); //after getting the random word and a winner,we are resetting the players array.
        s_lastTimeStamp = block.timestamp;
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        //require(success)
        if (!success) {
            revert Raffle__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

    /*view/pure functions */
    function getEntranceFee() public view returns (uint256) {
        //we want others to see the entrance fee
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index]; //we will get the list of players with this function which will take uint256 input parameter and return the address of the players
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getNumWords() public pure returns (uint256) {
        //pure:Num words is a constant variable which is in the byte code.Therefore it can stay pure as it is not a storage variable
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}
