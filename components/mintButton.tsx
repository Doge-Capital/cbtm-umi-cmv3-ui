import {
  CandyGuard,
  CandyMachine,
  mintV2,
} from "@metaplex-foundation/mpl-candy-machine";
import { GuardReturn } from "../utils/checkerHelper";
import {
  AddressLookupTableInput,
  KeypairSigner,
  PublicKey,
  Transaction,
  Umi,
  createBigInt,
  generateSigner,
  lamports,
  none,
  publicKey,
  signAllTransactions,
  some,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import {
  DigitalAsset,
  DigitalAssetWithToken,
  JsonMetadata,
  fetchDigitalAsset,
  fetchJsonMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { mintText } from "../settings";
import {
  Box,
  Button,
  Flex,
  HStack,
  Heading,
  SimpleGrid,
  Text,
  Tooltip,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  VStack,
  Divider,
  createStandaloneToast,
} from "@chakra-ui/react";
import {
  fetchAddressLookupTable,
  setComputeUnitLimit,
  setComputeUnitPrice,
} from "@metaplex-foundation/mpl-toolbox";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import {
  chooseGuardToUse,
  routeBuilder,
  mintArgsBuilder,
  GuardButtonList,
} from "../utils/mintHelper";
import { useSolanaTime } from "@/utils/SolanaTimeContext";
import { verifyTx } from "@/utils/verifyTx";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { FaArrowRightLong } from "react-icons/fa6";

const updateLoadingText = (
  loadingText: string | undefined,
  guardList: GuardReturn[],
  label: string,
  setGuardList: Dispatch<SetStateAction<GuardReturn[]>>
) => {
  const guardIndex = guardList.findIndex((g) => g.label === label);
  if (guardIndex === -1) {
    console.error("guard not found");
    return;
  }
  const newGuardList = [...guardList];
  newGuardList[guardIndex].loadingText = loadingText;
  setGuardList(newGuardList);
};

const fetchNft = async (umi: Umi, nftAdress: PublicKey) => {
  let digitalAsset: DigitalAsset | undefined;
  let jsonMetadata: JsonMetadata | undefined;
  try {
    digitalAsset = await fetchDigitalAsset(umi, nftAdress);
    jsonMetadata = await fetchJsonMetadata(umi, digitalAsset.metadata.uri);
  } catch (e) {
    console.error(e);
    createStandaloneToast().toast({
      title: "Nft could not be fetched!",
      description: "Please check your Wallet instead.",
      status: "info",
      duration: 2000,
      isClosable: true,
    });
  }

  return { digitalAsset, jsonMetadata };
};

const mintClick = async (
  umi: Umi,
  guard: GuardReturn,
  candyMachine: CandyMachine,
  candyGuard: CandyGuard,
  ownedTokens: DigitalAssetWithToken[],
  mintAmount: number,
  mintsCreated:
    | {
        mint: PublicKey;
        offChainMetadata: JsonMetadata | undefined;
      }[]
    | undefined,
  setMintsCreated: Dispatch<
    SetStateAction<
      | { mint: PublicKey; offChainMetadata: JsonMetadata | undefined }[]
      | undefined
    >
  >,
  guardList: GuardReturn[],
  setGuardList: Dispatch<SetStateAction<GuardReturn[]>>,
  onOpen: () => void,
  setCheckEligibility: Dispatch<SetStateAction<boolean>>
) => {
  const guardToUse = chooseGuardToUse(guard, candyGuard);
  if (!guardToUse.guards) {
    console.error("no guard defined!");
    return;
  }

  try {
    //find the guard by guardToUse.label and set minting to true
    const guardIndex = guardList.findIndex((g) => g.label === guardToUse.label);
    if (guardIndex === -1) {
      console.error("guard not found");
      return;
    }
    const newGuardList = [...guardList];
    newGuardList[guardIndex].minting = true;
    setGuardList(newGuardList);

    let routeBuild = await routeBuilder(umi, guardToUse, candyMachine);
    if (routeBuild) {
      createStandaloneToast().toast({
        title: "Allowlist detected. Please sign to be approved to mint.",
        status: "info",
        duration: 2000,
        isClosable: true,
      });
      await routeBuild.sendAndConfirm(umi, {
        confirm: { commitment: "processed" },
        send: {
          skipPreflight: true,
        },
      });
    }

    // fetch LUT
    let tables: AddressLookupTableInput[] = [];
    const lut = process.env.NEXT_PUBLIC_LUT;
    if (lut) {
      const lutPubKey = publicKey(lut);
      const fetchedLut = await fetchAddressLookupTable(umi, lutPubKey);
      tables = [fetchedLut];
    } else {
      createStandaloneToast().toast({
        title: "The developer should really set a lookup table!",
        status: "warning",
        duration: 2000,
        isClosable: true,
      });
    }

    const mintTxs: Transaction[] = [];
    let nftsigners = [] as KeypairSigner[];

    const latestBlockhash = await umi.rpc.getLatestBlockhash();

    for (let i = 0; i < mintAmount; i++) {
      const nftMint = generateSigner(umi);
      nftsigners.push(nftMint);

      const mintArgs = mintArgsBuilder(candyMachine, guardToUse, ownedTokens);
      let tx = transactionBuilder().add(
        mintV2(umi, {
          candyMachine: candyMachine.publicKey,
          collectionMint: candyMachine.collectionMint,
          collectionUpdateAuthority: candyMachine.authority,
          nftMint,
          group:
            guardToUse.label === "default" ? none() : some(guardToUse.label),
          candyGuard: candyGuard.publicKey,
          mintArgs,
          tokenStandard: candyMachine.tokenStandard,
        })
      );

      tx = tx.prepend(setComputeUnitLimit(umi, { units: 800_000 }));
      tx = tx.prepend(setComputeUnitPrice(umi, { lamports: lamports(10_000) }));
      tx = tx.setAddressLookupTables(tables);
      tx = tx.setBlockhash(latestBlockhash.blockhash);

      const transaction = tx.build(umi);
      mintTxs.push(transaction);
    }
    if (!mintTxs.length) {
      console.error("no mint tx built!");
      return;
    }

    updateLoadingText(`Please sign`, guardList, guardToUse.label, setGuardList);
    const signedTransactions = await signAllTransactions(
      mintTxs.map((transaction, index) => ({
        transaction,
        signers: [umi.payer, nftsigners[index]],
      }))
    );

    let signatures: Uint8Array[] = [];
    let amountSent = 0;
    const sendPromises = signedTransactions.map((tx, index) => {
      return umi.rpc
        .sendTransaction(tx)
        .then((signature) => {
          console.log(
            `Transaction ${index + 1} resolved with signature: ${
              base58.deserialize(signature)[0]
            }`
          );
          amountSent = amountSent + 1;
          signatures.push(signature);
          return { status: "fulfilled", value: signature };
        })
        .catch((error) => {
          console.error(`Transaction ${index + 1} failed:`, error);
          return { status: "rejected", reason: error };
        });
    });

    await Promise.allSettled(sendPromises);

    if (!(await sendPromises[0]).status === true) {
      // throw error that no tx was created
      throw new Error("no tx was created");
    }
    updateLoadingText(`Finalizing`, guardList, guardToUse.label, setGuardList);

    createStandaloneToast().toast({
      title: `${signedTransactions.length} Transaction(s) sent!`,
      status: "success",
      duration: 3000,
    });

    const successfulMints = await verifyTx(umi, signatures, latestBlockhash);

    updateLoadingText(
      "Fetching your NFT",
      guardList,
      guardToUse.label,
      setGuardList
    );

    // Filter out successful mints and map to fetch promises
    const fetchNftPromises = successfulMints.map((mintResult) =>
      fetchNft(umi, mintResult).then((nftData) => ({
        mint: mintResult,
        nftData,
      }))
    );

    const fetchedNftsResults = await Promise.all(fetchNftPromises);

    // Prepare data for setting mintsCreated
    let newMintsCreated: { mint: PublicKey; offChainMetadata: JsonMetadata }[] =
      [];
    fetchedNftsResults.map((acc) => {
      if (acc.nftData.digitalAsset && acc.nftData.jsonMetadata) {
        newMintsCreated.push({
          mint: acc.mint,
          offChainMetadata: acc.nftData.jsonMetadata,
        });
      }
      return acc;
    }, []);

    // Update mintsCreated only if there are new mints
    if (newMintsCreated.length > 0) {
      setMintsCreated(newMintsCreated);
      onOpen();
    }
  } catch (e) {
    console.error(`minting failed because of ${e}`);
    createStandaloneToast().toast({
      title: "Your mint failed!",
      description: "Please try again.",
      status: "error",
      duration: 2000,
      isClosable: true,
    });
  } finally {
    //find the guard by guardToUse.label and set minting to true
    const guardIndex = guardList.findIndex((g) => g.label === guardToUse.label);
    if (guardIndex === -1) {
      console.error("guard not found");
      return;
    }
    const newGuardList = [...guardList];
    newGuardList[guardIndex].minting = false;
    setGuardList(newGuardList);
    setCheckEligibility(true);
    updateLoadingText(undefined, guardList, guardToUse.label, setGuardList);
  }
};
// new component called timer that calculates the remaining Time based on the bigint solana time and the bigint toTime difference.
const Timer = ({
  solanaTime,
  toTime,
  setCheckEligibility,
}: {
  solanaTime: bigint;
  toTime: bigint;
  setCheckEligibility: Dispatch<SetStateAction<boolean>>;
}) => {
  const [remainingTime, setRemainingTime] = useState<bigint>(
    toTime - solanaTime
  );
  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        return prev - BigInt(1);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  //convert the remaining time in seconds to the amount of days, hours, minutes and seconds left
  const days = remainingTime / BigInt(86400);
  const hours = (remainingTime % BigInt(86400)) / BigInt(3600);
  const minutes = (remainingTime % BigInt(3600)) / BigInt(60);
  const seconds = remainingTime % BigInt(60);
  if (remainingTime !== BigInt(0)) {
    return (
      <Text fontSize="sm" fontWeight="bold" className="text-white">
        {days.toLocaleString("en-US", {
          minimumIntegerDigits: 2,
          useGrouping: false,
        })}
        d{" "}
        {hours.toLocaleString("en-US", {
          minimumIntegerDigits: 2,
          useGrouping: false,
        })}
        h{" "}
        {minutes.toLocaleString("en-US", {
          minimumIntegerDigits: 2,
          useGrouping: false,
        })}
        m{" "}
        {seconds.toLocaleString("en-US", {
          minimumIntegerDigits: 2,
          useGrouping: false,
        })}
        s
      </Text>
    );
  } else {
    setCheckEligibility(true);
  }
  return <Text></Text>;
};

type Props = {
  umi: Umi;
  guardList: GuardReturn[];
  candyMachine: CandyMachine | undefined;
  candyGuard: CandyGuard | undefined;
  ownedTokens: DigitalAssetWithToken[] | undefined;
  setGuardList: Dispatch<SetStateAction<GuardReturn[]>>;
  mintsCreated:
    | {
        mint: PublicKey;
        offChainMetadata: JsonMetadata | undefined;
      }[]
    | undefined;
  setMintsCreated: Dispatch<
    SetStateAction<
      | { mint: PublicKey; offChainMetadata: JsonMetadata | undefined }[]
      | undefined
    >
  >;
  onOpen: () => void;
  setCheckEligibility: Dispatch<SetStateAction<boolean>>;
};

export function ButtonList({
  umi,
  guardList,
  candyMachine,
  candyGuard,
  ownedTokens = [], // provide default empty array
  setGuardList,
  mintsCreated,
  setMintsCreated,
  onOpen,
  setCheckEligibility,
}: Props): JSX.Element {
  const solanaTime = useSolanaTime();
  const [numberInputValues, setNumberInputValues] = useState<{
    [label: string]: number;
  }>({});
  if (!candyMachine || !candyGuard) {
    return <></>;
  }

  const handleNumberInputChange = (label: string, value: number) => {
    setNumberInputValues((prev) => ({ ...prev, [label]: value }));
  };

  const handleNumberInputClick = (
    label: string,
    action: "increment" | "decrement"
  ) => {
    if (action === "increment") {
      setNumberInputValues((prev) => ({
        ...prev,
        [label]: (prev[label] || 0) + 1,
      }));
    } else {
      setNumberInputValues((prev) => ({
        ...prev,
        [label]: Math.max((prev[label] || 0) - 1, 1),
      }));
    }
  };

  // remove duplicates from guardList
  //fucked up bugfix
  let filteredGuardlist = guardList.filter(
    (elem, index, self) =>
      index === self.findIndex((t) => t.label === elem.label)
  );
  if (filteredGuardlist.length === 0) {
    return <></>;
  }
  // Guard "default" can only be used to mint in case no other guard exists
  if (filteredGuardlist.length > 1) {
    filteredGuardlist = guardList.filter((elem) => elem.label != "default");
  }
  let buttonGuardList = [];
  for (const guard of filteredGuardlist) {
    const text = mintText.find((elem) => elem.label === guard.label);
    // find guard by label in candyGuard
    const group = candyGuard.groups.find((elem) => elem.label === guard.label);
    let startTime = createBigInt(0);
    let endTime = createBigInt(0);
    if (group) {
      if (group.guards.startDate.__option === "Some") {
        startTime = group.guards.startDate.value.date;
      }
      if (group.guards.endDate.__option === "Some") {
        endTime = group.guards.endDate.value.date;
      }
    }

    let buttonElement: GuardButtonList = {
      label: guard ? guard.label : "default",
      allowed: guard.allowed,
      header: text ? text.header : "header missing in settings.tsx",
      mintText: text ? text.mintText : "mintText missing in settings.tsx",
      buttonLabel: text
        ? text.buttonLabel
        : "buttonLabel missing in settings.tsx",
      startTime,
      endTime,
      tooltip: guard.reason,
      maxAmount: guard.maxAmount,
    };
    buttonGuardList.push(buttonElement);
  }

  const listItems = buttonGuardList.map((buttonGuard, index) => (
    <Box key={index} marginTop={"10px"} marginBottom={"15px"}>
      <Divider my="10px" />
      <HStack marginTop="5" marginBottom="" paddingLeft="3" paddingRight="3">
        <Heading
          size="xs"
          textTransform="uppercase"
          color="white"
          className="font-inter"
        >
          {buttonGuard.header}
        </Heading>
        <Flex justifyContent="flex-end" marginLeft="auto">
          {buttonGuard.endTime > createBigInt(0) &&
            buttonGuard.endTime - solanaTime > createBigInt(0) &&
            (!buttonGuard.startTime ||
              buttonGuard.startTime - solanaTime <= createBigInt(0)) && (
              <>
                <Text fontSize="sm" marginRight={"2"} className="text-white">
                  Ending in:{" "}
                </Text>
                <Timer
                  toTime={buttonGuard.endTime}
                  solanaTime={solanaTime}
                  setCheckEligibility={setCheckEligibility}
                />
              </>
            )}
          {buttonGuard.startTime > createBigInt(0) &&
            buttonGuard.startTime - solanaTime > createBigInt(0) &&
            (!buttonGuard.endTime ||
              solanaTime - buttonGuard.endTime <= createBigInt(0)) && (
              <>
                <Text fontSize="sm" marginRight={"2"} className="text-white">
                  Starting in:{" "}
                </Text>
                <Timer
                  toTime={buttonGuard.startTime}
                  solanaTime={solanaTime}
                  setCheckEligibility={setCheckEligibility}
                />
              </>
            )}
        </Flex>
      </HStack>
      {/* <HStack paddingLeft="3" paddingRight="3" marginBottom="" > */}
      <SimpleGrid columns={2} spacing={10} paddingLeft="3" paddingRight="">
        <Text pt="2" fontSize="sm" color="white" className="font-inter">
          {buttonGuard.mintText}
        </Text>
        {/* <Flex justifyContent="flex-end" marginLeft="auto"> */}
        <VStack>
          {process.env.NEXT_PUBLIC_MULTIMINT && buttonGuard.allowed ? (
            <NumberInput
              value={numberInputValues[buttonGuard.label] || 1}
              min={1}
              max={buttonGuard.maxAmount < 1 ? 1 : buttonGuard.maxAmount}
              size="sm"
              isDisabled={!buttonGuard.allowed}
              onChange={(valueAsString, valueAsNumber) =>
                handleNumberInputChange(buttonGuard.label, valueAsNumber)
              }
              pos={"relative"}
              backgroundColor="white"
              color="black"
              borderRadius="md"
              className="font-roboto lg:w-[150px] md:w-[120px] sm:w-[100px] w-[80px]"
            >
              <NumberInputField />
              <div className="absolute right-5 top-[0.2rem]">
                <NumberInputStepper>
                  <Flex alignItems="center" justifyContent="center" gap="1">
                    <Button
                      size="xs"
                      fontWeight="bold"
                      backgroundColor={"gray.300"}
                      isDisabled={
                        numberInputValues[buttonGuard.label] >=
                        buttonGuard.maxAmount
                      }
                      onClick={() =>
                        handleNumberInputClick(buttonGuard.label, "increment")
                      }
                    >
                      +
                    </Button>
                    <Button
                      size="xs"
                      fontWeight="bold"
                      backgroundColor={"gray.300"}
                      isDisabled={numberInputValues[buttonGuard.label] == 1}
                      onClick={() =>
                        handleNumberInputClick(buttonGuard.label, "decrement")
                      }
                    >
                      -
                    </Button>
                  </Flex>
                </NumberInputStepper>
              </div>
            </NumberInput>
          ) : null}
          <Tooltip label={buttonGuard.tooltip} aria-label="Mint button">
            <Button
              onClick={() =>
                mintClick(
                  umi,
                  buttonGuard,
                  candyMachine,
                  candyGuard,
                  ownedTokens,
                  numberInputValues[buttonGuard.label] || 1,
                  mintsCreated,
                  setMintsCreated,
                  guardList,
                  setGuardList,
                  onOpen,
                  setCheckEligibility
                )
              }
              key={buttonGuard.label}
              fontWeight="bold"
              size="sm"
              backgroundColor="#f8f8b4"
              isDisabled={!buttonGuard.allowed}
              isLoading={
                guardList.find((elem) => elem.label === buttonGuard.label)
                  ?.minting
              }
              loadingText={
                guardList.find((elem) => elem.label === buttonGuard.label)
                  ?.loadingText
              }
              gap="2"
              className="font-roboto lg:w-[150px] md:w-[120px] sm:w-[100px] w-[80px]"
            >
              {buttonGuard.buttonLabel}
              <FaArrowRightLong />
            </Button>
          </Tooltip>
        </VStack>
        {/* </Flex> */}
      </SimpleGrid>
      {/* </HStack> */}
    </Box>
  ));

  return <>{listItems}</>;
}
