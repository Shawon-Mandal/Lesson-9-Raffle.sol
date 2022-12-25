const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")

const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", async function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval //the things we need to deploy
          const chainId = network.config.chainId

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
          it("doesnt allow entrance when raffle is calculating", async function () {
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
          })
      })
