import { ContractInterface, ethers } from 'ethers'
import { useQuery } from '@tanstack/react-query'
import { useProvider } from 'wagmi'
import { IContractReadConfig, ITransactionError } from '~/types'
import useConfig from './useConfig'

interface IContractArgs extends IContractReadConfig {
	poolAbi: ContractInterface
}

interface IGetAllPoolsArgs {
	contractArgs: IContractArgs
	chainId?: number | null
}

export interface IPool {
	name: string
	symbol: string
	maxLoanLength: number
	currentAnnualInterest: number
	address: string
}

async function getAllpools({ contractArgs, chainId }: IGetAllPoolsArgs) {
	try {
		// return empty array when no chainId, as there is no chainId returned on /pool/[chainName] when chainName is not supported/invalid
		if (!chainId) {
			return []
		}

		const { address, abi, provider, poolAbi } = contractArgs

		if (!address || !abi || !provider || !poolAbi) {
			throw new Error('Invalid arguments')
		}

		const factory = new ethers.Contract(address, abi, provider)

		// get no.of pools created from factory and loop over them to get their addresses
		const poolsLength = await factory.allPoolsLength()

		const poolAddresses = await Promise.all(
			new Array(Number(poolsLength)).fill(1).map((_, index) => factory.allPools(index))
		)

		const allPoolContracts = poolAddresses.map((address) => {
			return new ethers.Contract(address, poolAbi, provider)
		})

		const allPoolNames = await Promise.all(allPoolContracts.map((contract) => contract.name()))

		const allPoolSymbols = await Promise.all(allPoolContracts.map((contract) => contract.symbol()))

		const allPoolMaxLoanLengths = await Promise.all(allPoolContracts.map((contract) => contract.maxLoanLength()))

		const allPoolCurrentAnnualInterests = (
			await Promise.allSettled(allPoolContracts.map((contract) => contract.currentAnnualInterest(0)))
		).map((x) => (x.status === 'rejected' ? 0 : x.value))

		return allPoolNames.map((name, index) => ({
			name,
			symbol: allPoolSymbols[index],
			maxLoanLength: Number(allPoolMaxLoanLengths[index]),
			currentAnnualInterest: Number(allPoolCurrentAnnualInterests[index]),
			address: poolAddresses[index]
		}))
	} catch (error: any) {
		throw new Error(error.message || (error?.reason ?? "Couldn't get pools"))
	}
}

export function useGetAllPools({ chainId }: { chainId?: number | null }) {
	const config = useConfig(chainId)

	const provider = useProvider()

	const contractArgs: IContractArgs = {
		address: config.factoryAddress,
		abi: config.factoryABI,
		poolAbi: config.poolABI,
		provider
	}

	return useQuery<Array<IPool>, ITransactionError>(
		['allPools', chainId],
		() => getAllpools({ contractArgs, chainId }),
		{
			refetchInterval: 30_000
		}
	)
}