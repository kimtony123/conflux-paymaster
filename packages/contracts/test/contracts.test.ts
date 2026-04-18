import { ethers } from "hardhat";
import { expect } from "chai";

const ENTRY_POINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

describe("SimpleAccountFactory", function () {
  let factory: any;
  let owner: any;
  let other: any;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();
    
    const Factory = await ethers.getContractFactory("SimpleAccountFactory");
    factory = await Factory.deploy(ENTRY_POINT_ADDRESS);
    await factory.waitForDeployment();
  });

  describe("createAccount", function () {
    it("should deploy a new SimpleAccount", async function () {
      await expect(factory.createAccount(owner.address, 0))
        .to.emit(factory, "AccountCreated");
      
      const accountAddress = await factory.getAccount(owner.address);
      expect(accountAddress).to.not.equal(ethers.ZeroAddress);
      expect(await ethers.provider.getCode(accountAddress)).to.not.equal("0x");
    });

    it("should create accounts for multiple users", async function () {
      await factory.createAccount(owner.address, 0);
      await factory.createAccount(other.address, 0);
      
      const account1 = await factory.getAccount(owner.address);
      const account2 = await factory.getAccount(other.address);
      
      expect(account1).to.not.equal(account2);
    });

    it("should revert if account already exists", async function () {
      await factory.createAccount(owner.address, 0);
      await expect(factory.createAccount(owner.address, 0))
        .to.be.revertedWith("Account already exists");
    });

    it("should set correct entry point", async function () {
      expect(await factory.entryPoint()).to.equal(ENTRY_POINT_ADDRESS);
    });
  });

  describe("getAccount", function () {
    it("should return zero address for non-existent account", async function () {
      const account = await factory.getAccount(other.address);
      expect(account).to.equal(ethers.ZeroAddress);
    });

    it("should return deployed account address", async function () {
      await factory.createAccount(owner.address, 0);
      expect(await factory.getAccount(owner.address)).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("accountExists", function () {
    it("should return false for non-deployed address", async function () {
      expect(await factory.accountExists(ethers.Wallet.createRandom().address)).to.equal(false);
    });

    it("should return true for deployed account", async function () {
      await factory.createAccount(owner.address, 0);
      const account = await factory.getAccount(owner.address);
      expect(await factory.accountExists(account)).to.equal(true);
    });
  });
});

describe("SimpleAccount", function () {
  let factory: any;
  let account: any;
  let owner: any;
  let other: any;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();
    
    const Factory = await ethers.getContractFactory("SimpleAccountFactory");
    factory = await Factory.deploy(ENTRY_POINT_ADDRESS);
    await factory.waitForDeployment();
    
    await factory.createAccount(owner.address, 0);
    const accountAddress = await factory.getAccount(owner.address);
    
    const SimpleAccount = await ethers.getContractFactory("SimpleAccount");
    account = SimpleAccount.attach(accountAddress);
  });

  describe("state", function () {
    it("should have correct owner", async function () {
      expect(await account.owner()).to.equal(owner.address);
    });

    it("should have correct entry point", async function () {
      expect(await account.entryPoint()).to.equal(ENTRY_POINT_ADDRESS);
    });

    it("should have nonce of 0", async function () {
      expect(await account.getNonce()).to.equal(0);
    });
  });

  describe("transferOwnership", function () {
    it("should transfer ownership", async function () {
      await account.connect(owner).transferOwnership(other.address);
      expect(await account.owner()).to.equal(other.address);
    });

    it("should revert if not owner", async function () {
      await expect(account.connect(other).transferOwnership(other.address))
        .to.be.revertedWith("Only owner");
    });

    it("should revert to zero address", async function () {
      await expect(account.connect(owner).transferOwnership(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid owner");
    });
  });

  describe("receive", function () {
    it("should accept native tokens", async function () {
      await owner.sendTransaction({ to: account.target, value: ethers.parseEther("1.0") });
      expect(await ethers.provider.getBalance(account.target)).to.equal(ethers.parseEther("1.0"));
    });
  });
});

describe("VerifyingPaymaster", function () {
  let paymaster: any;
  let owner: any;
  let verifier: any;
  let user: any;

  beforeEach(async function () {
    [owner, verifier, user] = await ethers.getSigners();
    
    const Paymaster = await ethers.getContractFactory("VerifyingPaymaster");
    paymaster = await Paymaster.deploy(
      ENTRY_POINT_ADDRESS,
      verifier.address,
      ethers.parseEther("0.01"),
      86400
    );
    await paymaster.waitForDeployment();
  });

  describe("deployment", function () {
    it("should set correct entry point", async function () {
      expect(await paymaster.entryPoint()).to.equal(ENTRY_POINT_ADDRESS);
    });

    it("should set correct verifier", async function () {
      expect(await paymaster.verifier()).to.equal(verifier.address);
    });

    it("should set correct owner", async function () {
      expect(await paymaster.owner()).to.equal(owner.address);
    });

    it("should set correct minStake", async function () {
      expect(await paymaster.minStake()).to.equal(ethers.parseEther("0.01"));
    });

    it("should set correct unstakeDelay", async function () {
      expect(await paymaster.unstakeDelay()).to.equal(86400);
    });
  });

  describe("setVerifier", function () {
    it("should allow owner to set new verifier", async function () {
      await paymaster.connect(owner).setVerifier(user.address);
      expect(await paymaster.verifier()).to.equal(user.address);
    });

    it("should emit VerifierSet event", async function () {
      await expect(paymaster.connect(owner).setVerifier(user.address))
        .to.emit(paymaster, "VerifierSet")
        .withArgs(verifier.address, user.address);
    });

    it("should revert if not owner", async function () {
      await expect(paymaster.connect(user).setVerifier(user.address))
        .to.be.revertedWithCustomError(paymaster, "OwnableUnauthorizedAccount");
    });

    it("should revert if setting zero address", async function () {
      await expect(paymaster.connect(owner).setVerifier(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid verifier");
    });
  });

  describe("setMinStake", function () {
    it("should allow owner to update stake", async function () {
      await paymaster.connect(owner).setMinStake(ethers.parseEther("0.1"));
      expect(await paymaster.minStake()).to.equal(ethers.parseEther("0.1"));
    });

    it("should revert if not owner", async function () {
      await expect(paymaster.connect(user).setMinStake(0))
        .to.be.revertedWithCustomError(paymaster, "OwnableUnauthorizedAccount");
    });
  });

  describe("getHash", function () {
    it("should compute hash for UserOperation", async function () {
      const userOp = {
        sender: user.address,
        nonce: 0,
        initCode: "0x",
        callData: "0x",
        callGasLimit: 200000,
        verificationGasLimit: 200000,
        preVerificationGas: 50000,
        maxFeePerGas: 1000000000,
        maxPriorityFeePerGas: 1000000000,
        paymasterAndData: "0x",
        signature: "0x"
      };
      
      const hash = await paymaster.getHash(userOp, 0, 0);
      expect(hash).to.not.equal(ethers.ZeroHash);
    });

    it("should produce different hashes for different operations", async function () {
      const userOp1 = { sender: owner.address, nonce: 0, initCode: "0x", callData: "0x", callGasLimit: 200000, verificationGasLimit: 200000, preVerificationGas: 50000, maxFeePerGas: 1000000000, maxPriorityFeePerGas: 1000000000, paymasterAndData: "0x", signature: "0x" };
      const userOp2 = { sender: user.address, nonce: 0, initCode: "0x", callData: "0x", callGasLimit: 200000, verificationGasLimit: 200000, preVerificationGas: 50000, maxFeePerGas: 1000000000, maxPriorityFeePerGas: 1000000000, paymasterAndData: "0x", signature: "0x" };
      
      const hash1 = await paymaster.getHash(userOp1, 0, 0);
      const hash2 = await paymaster.getHash(userOp2, 0, 0);
      
      expect(hash1).to.not.equal(hash2);
    });
  });

  describe("receive", function () {
    it("should accept native tokens", async function () {
      await owner.sendTransaction({ to: paymaster.target, value: ethers.parseEther("1.0") });
      expect(await ethers.provider.getBalance(paymaster.target)).to.equal(ethers.parseEther("1.0"));
    });
  });
});

describe("Signature Verification", function () {
  let paymaster: any;
  let verifier: any;

  beforeEach(async function () {
    [, verifier] = await ethers.getSigners();
    
    const Paymaster = await ethers.getContractFactory("VerifyingPaymaster");
    paymaster = await Paymaster.deploy(
      ENTRY_POINT_ADDRESS,
      verifier.address,
      ethers.parseEther("0.01"),
      86400
    );
    await paymaster.waitForDeployment();
  });

  it("should create verifiable signatures", async function () {
    const userOp = {
      sender: ethers.Wallet.createRandom().address,
      nonce: 5,
      initCode: "0xabcd",
      callData: "0x1234",
      callGasLimit: 300000,
      verificationGasLimit: 400000,
      preVerificationGas: 60000,
      maxFeePerGas: 2000000000,
      maxPriorityFeePerGas: 1000000000,
      paymasterAndData: "0x",
      signature: "0x"
    };
    
    const hash = await paymaster.getHash(userOp, 0, 0);
    const ethSignedHash = ethers.hashMessage(ethers.toBeArray(hash));
    const signature = await verifier.signMessage(ethers.toBeArray(ethSignedHash));
    const recovered = ethers.verifyMessage(ethers.toBeArray(ethSignedHash), signature);
    
    expect(recovered).to.equal(verifier.address);
  });

  it("should detect tampered operations", async function () {
    const userOp1 = { sender: ethers.Wallet.createRandom().address, nonce: 0, initCode: "0x", callData: "0x", callGasLimit: 200000, verificationGasLimit: 200000, preVerificationGas: 50000, maxFeePerGas: 1000000000, maxPriorityFeePerGas: 1000000000, paymasterAndData: "0x", signature: "0x" };
    const userOp2 = { sender: ethers.Wallet.createRandom().address, nonce: 0, initCode: "0x", callData: "0x", callGasLimit: 200000, verificationGasLimit: 200000, preVerificationGas: 50000, maxFeePerGas: 1000000000, maxPriorityFeePerGas: 1000000000, paymasterAndData: "0x", signature: "0x" };
    
    const hash1 = await paymaster.getHash(userOp1, 0, 0);
    const hash2 = await paymaster.getHash(userOp2, 0, 0);
    
    expect(hash1).to.not.equal(hash2);
  });
});

describe("Integration", function () {
  it("should deploy complete infrastructure", async function () {
    const [owner, verifier] = await ethers.getSigners();
    
    const Factory = await ethers.getContractFactory("SimpleAccountFactory");
    const factory = await Factory.deploy(ENTRY_POINT_ADDRESS);
    await factory.waitForDeployment();
    
    const Paymaster = await ethers.getContractFactory("VerifyingPaymaster");
    const paymaster = await Paymaster.deploy(
      ENTRY_POINT_ADDRESS,
      verifier.address,
      ethers.parseEther("0.01"),
      86400
    );
    await paymaster.waitForDeployment();
    
    await factory.createAccount(owner.address, 0);
    const accountAddress = await factory.getAccount(owner.address);
    
    const SimpleAccount = await ethers.getContractFactory("SimpleAccount");
    const account = SimpleAccount.attach(accountAddress);
    
    expect(await account.owner()).to.equal(owner.address);
    expect(await account.entryPoint()).to.equal(ENTRY_POINT_ADDRESS);
    expect(await factory.entryPoint()).to.equal(ENTRY_POINT_ADDRESS);
    expect(await paymaster.entryPoint()).to.equal(ENTRY_POINT_ADDRESS);
    expect(await paymaster.verifier()).to.equal(verifier.address);
  });
});
