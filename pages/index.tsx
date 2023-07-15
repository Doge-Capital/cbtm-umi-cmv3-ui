import {
  PublicKey,
  publicKey,
  Umi,
} from "@metaplex-foundation/umi";
import { DigitalAssetWithToken, fetchDigitalAsset } from "@metaplex-foundation/mpl-token-metadata";
import { Inter } from "@next/font/google";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useUmi } from "../utils/useUmi";
import { fetchCandyMachine, safeFetchCandyGuard, CandyGuard, CandyMachine } from "@metaplex-foundation/mpl-candy-machine"
import styles from "../styles/Home.module.css";
import { guardChecker } from "../utils/checkAllowed";
import { Center, Card, CardHeader, CardBody, StackDivider, Heading, Stack, useToast, Spinner, Skeleton, useDisclosure, Button, Modal, ModalBody, ModalCloseButton, ModalContent, Image, ModalHeader, ModalOverlay, Box, Divider } from '@chakra-ui/react';
import { ButtonList } from "../components/mintButton";
import { GuardReturn } from "../utils/checkerHelper";
import { ShowNft } from "@/components/showNft";
import { InitializeModal } from "@/components/initializeModal";

const inter = Inter({ subsets: ["latin"] });

const WalletMultiButtonDynamic = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const useCandyMachine = (umi: Umi, candyMachineId: string) => {
  const [candyMachine, setCandyMachine] = useState<CandyMachine>();
  const [candyGuard, setCandyGuard] = useState<CandyGuard>();
  const toast = useToast();


  useEffect(() => {
    (async () => {
      if (!candyMachineId) {
        console.error("No candy machine in .env!");
        if (!toast.isActive("no-cm")) {
          toast({
            id: "no-cm",
            title: "No candy machine in .env!",
            description: "Add your candy machine address to the .env file!",
            status: "error",
            duration: 999999,
            isClosable: true,
          });
        }
        return;
      }

      let candyMachine;
      try {
        candyMachine = await fetchCandyMachine(umi, publicKey(candyMachineId));
      } catch (e) {
        console.error(e);
        toast({
          id: "no-cm-found",
          title: "The CM from .env is invalid",
          description: "Are you using the correct environment?",
          status: "error",
          duration: 999999,
          isClosable: true,
        });
      }
      setCandyMachine(candyMachine);
      if (!candyMachine) {
        return;
      }
      let candyGuard;
      try {
        candyGuard = await safeFetchCandyGuard(umi, candyMachine.mintAuthority);
      } catch (e) {
        console.error(e);
        toast({
          id: "no-guard-found",
          title: "No Candy Guard found!",
          description: "Do you have one assigned?",
          status: "error",
          duration: 999999,
          isClosable: true,
        });
      }
      if (!candyGuard) {
        return;
      }
      setCandyGuard(candyGuard);
    })();
  }, []);

  return { candyMachine, candyGuard };


};

export interface IsMinting {
  label: string;
  minting: boolean;
}

export default function Home() {
  const umi = useUmi();
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isInitializerOpen, onOpen: onInitializerOpen, onClose: onInitializerClose } = useDisclosure();
  const [mintsCreated, setMintsCreated] = useState<PublicKey[]>([publicKey("11111111111111111111111111111111")]);
  const [isAllowed, setIsAllowed] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [isMinting, setIsMinting] = useState<IsMinting[]>([{ label: "default", minting: false }]);
  const [ownedTokens, setOwnedTokens] = useState<DigitalAssetWithToken[]>();
  const [guards, setGuards] = useState<GuardReturn[]>([
    { label: "startDefault", allowed: false },
  ]);

  if (!process.env.NEXT_PUBLIC_CANDY_MACHINE_ID) {
    console.error("No candy machine in .env!")
    if (!toast.isActive('no-cm')) {
      toast({
        id: 'no-cm',
        title: 'No candy machine in .env!',
        description: "Add your candy machine address to the .env file!",
        status: 'error',
        duration: 999999,
        isClosable: true,
      })
    }
  }
  const candyMachineId: PublicKey = useMemo(() => {
    if (process.env.NEXT_PUBLIC_CANDY_MACHINE_ID) {
      return publicKey(process.env.NEXT_PUBLIC_CANDY_MACHINE_ID);
    } else {
      console.error(`NO CANDY MACHINE IN .env FILE DEFINED!`);
      toast({
        id: 'no-cm',
        title: 'No candy machine in .env!',
        description: "Add your candy machine address to the .env file!",
        status: 'error',
        duration: 999999,
        isClosable: true,
      })
      return publicKey("11111111111111111111111111111111");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { candyMachine, candyGuard } = useCandyMachine(umi, candyMachineId);

  useEffect(() => {
    const checkEligibility = async () => {
      if (candyMachine === undefined || !candyGuard) {
        return;
      }

      const { guardReturn, ownedTokens } = await guardChecker(
        umi, candyGuard, candyMachine
      );

      setOwnedTokens(ownedTokens);
      setGuards(guardReturn);
      setIsAllowed(false);

      let allowed = false;
      for (const guard of guardReturn) {
        if (guard.allowed) {
          allowed = true;
          break;
        }
      }

      setIsAllowed(allowed);
      setLoading(false);
    };

    checkEligibility();
  }, [candyMachine, candyGuard, umi]);

  const PageContent = () => {

    return (
      <>
        <style jsx global>
          {`
      body {
          background: #2d3748; 
       }
   `}
        </style>
        <Card>
          <CardHeader>
            <Heading size='md'>Mark&apos;s mint UI</Heading>
          </CardHeader>

          <CardBody>
            <Center>
              <Box
                rounded={'lg'}
                mt={-12}
                pos={'relative'}>
                <Image
                  rounded={'lg'}
                  height={230}
                  objectFit={'cover'}
                  alt={"project Image"}
                  src={"https://avatars.githubusercontent.com/u/93528482?v=4"}
                />
              </Box>
            </Center>
            <Divider my="10px" />
            <Stack divider={<StackDivider />} spacing='8'>
              {loading ? (
                <div>
                  <Skeleton height="30px" my="10px" />
                  <Skeleton height="30px" my="10px" />
                  <Skeleton height="30px" my="10px" />
                </div>
              ) : (
                <ButtonList
                  guardList={guards}
                  candyMachine={candyMachine}
                  candyGuard={candyGuard}
                  umi={umi}
                  ownedTokens={ownedTokens}
                  toast={toast}
                  setIsMinting={setIsMinting}
                  isMinting={isMinting}
                  setMintsCreated={setMintsCreated}
                  onOpen={onOpen}
                />
              )}
            </Stack>
          </CardBody>
        </Card >
        {umi.identity.publicKey === candyMachine?.authority ? (
          <>
            <Center>
              <Button backgroundColor={"red.200"} marginTop={"10"} onClick={onInitializerOpen}>Initialize Everything!</Button>
            </Center>
            <Modal isOpen={isInitializerOpen} onClose={onInitializerClose}>
              <ModalOverlay />
              <ModalContent>
                <ModalHeader>Initializer</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                  < InitializeModal umi={umi} candyMachine={candyMachine} candyGuard={candyGuard} toast={toast} />
                </ModalBody>
              </ModalContent>
            </Modal>

          </>)
          :
          (<></>)
        }

        <Modal isOpen={isOpen} onClose={onClose}>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Your minted NFT:</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <ShowNft umi={umi} nfts={mintsCreated} />
            </ModalBody>
          </ModalContent>
        </Modal>
      </>
    );
  };

  return (
    <>
      <Head>
        <title>Mint UI by MarkSackerberg</title>
        <meta name="description" content="Mint UI by MarkSackerberg" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={inter.className}>
        <div className={styles.wallet}>
          <WalletMultiButtonDynamic />
        </div>

        <div className={styles.center}>
          <PageContent key="content" />
        </div>
      </main>
    </>
  );
}
