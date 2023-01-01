const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { resolveConfig } = require("prettier")

const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name) //if we are not on a developmentChain
    ? describe.skip //skip it
    : describe("Raffle Unit Tests", async function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval //the things we need to deploy
          const chainId = network.config.chainId //run this as we are on a development chain

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"]) //we are going to deploy the files which inclues "all" tag
              raffle = await ethers.getContract("Raffle", deployer) //we are going to get the raffle connect it with the deployer
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer) //same way mentioned above
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          describe("constructor", function () {
              it("Initializes the raffle correctly", async function () {
                  //Ideally we make our test have just one assert per "it"
                  const raffleState = await raffle.getRaffleState()

                  assert.equal(raffleState.toString(), "0") //we will get the raffle state in string otherwise it will turn into a uint256 as it will return 0/1
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"]) //we are getting "interval" from chainId from helper hardhat config
              })
          })

          describe("enterRaffle", function () {
              it("reverts when you dont pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughEthEntered"
                  )
              })
          })
          it("records players when they enter", async function () {
              await raffle.enterRaffle({ value: raffleEntranceFee })
              const playerFromContract = await raffle.getPlayer(0) //we are selecting the first person from the contract(deployer)
              assert.equal(playerFromContract, deployer) //player form contract should be the deployer
          })

          it("emits event on enter", async function () {
              await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                  raffle,
                  "RaffleEnter"
              )
          })
          it("doesnt allow entrants when raffle is calculating", async function () {
              await raffle.enterRaffle({ value: raffleEntranceFee })
              await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
              await network.provider.send("evm_mine", [])
              // We pretend to be a chainlink keeper
              await raffle.performUpkeep([]) //we are passing this call data with the empty array
              //Now the raffle should be in a calculating state
              await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                  "Raffle__NotOpen"
              )
          })
          describe("checkUpkeep", function () {
              it("returns false if people haven't sent any ETH", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]) //callStatic:stimulate the transaction(not sending it) to see what happens
                  //{upkeepNeeded}:extrapolate only the upkeepneeded
                  assert(!upkeepNeeded)
              })
              it("returns false if raffle isn't open", async function () {
                  //we will make everything true in checkupkeep expect making raffle in the calculating state
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  await raffle.performUpkeep([]) //[]/"0x":sending a blind bytes object
                  const raffleState = await raffle.getRaffleState() //stores new state
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(raffleState.toString(), "1") //making the raffle in calculating state
                  assert.equal(upkeepNeeded, false) //upkeepneeded should be in false state
              })
              it("returns false if enough time hasn't passed", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed,has players,eth,and is open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(upkeepNeeded)
              })
          })
          describe("performUpkeep", function () {
              it("it can only run if checkupkeep is true", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const tx = await raffle.performUpkeep([])
                  assert(tx)
              })
              it("reverts when checkupkeep is false", async function () {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Rafflle__UpkeepNotNeeded"
                  )
              })
              it("updates the raffle state,emits an event,and calls the vrf coordinator", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const txResponse = await raffle.performUpkeep([])
                  const txReceipt = await txResponse.wait(1)
                  const requestId = txReceipt.events[1].args.requestId
                  const raffleState = await raffle.getRaffleState()
                  assert(requestId.toNumber() > 0)
                  assert(raffleState.toString() == "1")
              })
          })
          describe("fulfilRandomWords", function () {
              beforeEach(async function () {
                  //we want somebody to enter the raffle before we run any tests
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
              })
              it("can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address) //reqId:0,chainlinkID:raffle.address
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address) //reqId:1,chainlinkId:raffle.address
                  ).to.be.revertedWith("nonexistent request")
              })

              //Massive promise test
              it("picks winner,resets the lottery,and sends money", async function () {
                  const additionalEntrants = 3
                  const startingAccountIndex = 1 //deployer=0
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                  }
                  const startingTimeStamp = await raffle.getLatestTimeStamp()

                  //performUpkeep (mock being chainlink keepers)
                  //fulfillRandomWords(mock being chainlink VRF)
                  //We will have to wait for the fulfillRandomWords to be called
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          //raffle.once winner picked happens,do some stuff:()=>{}
                          console.log("Found the event")
                          try {
                              const recentWinner = await raffle.getRecentWinner()

                              const raffleState = await raffle.getRaffleState()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              const numPlayers = await raffle.getNumberOfPlayers()
                              const winnerEndingBalance = await accounts[1].getBalance()
                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)

                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(
                                      raffleEntranceFee
                                          .mul(additionalEntrants)
                                          .add(raffleEntranceFee)
                                          .toString()
                                  )
                              )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
                      //setting up the listener
                      //below,we will fire the event,and the listener will pick pick it up and resolve
                      const tx = await raffle.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      const winnerStartingBalance = await accounts[1].getBalance()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address //we are going to trigger the vrfV2mock and get the request id and consumer address
                      )
                  })
              })
          })
      })
