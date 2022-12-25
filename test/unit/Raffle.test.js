const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")

const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", async function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer //the things we need to deploy
          const chainId = network.config.chainId

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"]) //we are going to deploy the files which inclues "all" tag
              raffle = await ethers.getContract("Raffle", deployer) //we are going to get the raffle connect it with the deployer
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer) //same way mentioned above
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("constructor", async function () {
              it("Initializes the raffle correctly", async function () {
                  //Ideally we make our test have just one assert per "it"
                  const raffleState = await raffle.getRaffleState()
                  const interval = await raffle.getInterval()
                  assert.equal(raffleState.toString(), "0") //we will get the raffle state in string otherwise it will turn into a uint256 as it will return 0/1
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"]) //we are getting "interval" from chainId from helper hardhat config
              })
          })

          describe("enterRaffle", async function () {
              it("reverts when you dont pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughEthEntered"
                  )
              })
          })
          it("records players when they enter", async function () {
              await raffle.enterRaffle({ value: raffleEntranceFee })
              const playerFromContract = await raffle.getPlayer(0)
              assert.equal(playerFromContract, deployer) //player form contract should be the deployer
          })
      })
