import { useEffect, useMemo, useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { Effect } from 'effect';

import { usePaste } from '../opentui-hooks.ts';
import { runCliEffect } from '../../effect/runtime.ts';
import { useConfigContext } from '../context/config-context.tsx';
import { useMessagesContext } from '../context/messages-context.tsx';
import { formatError } from '../lib/format-error.ts';
import { services } from '../services.ts';
import { colors } from '../theme.ts';
import type { Repo, WizardStep } from '../types.ts';

export type AddResourceType = 'bioconductor' | 'git' | 'cran' | 'local';
type ResourceType = AddResourceType;

type AddResourceWizardStep =
	| 'type'
	| 'name'
	| 'url'
	| 'branch'
	| 'searchPath'
	| 'path'
	| 'package'
	| 'notes'
	| 'confirm';

interface StepInfo {
	title: string;
	hint: string;
	placeholder: string;
	required: boolean;
}

const GIT_STEPS: AddResourceWizardStep[] = [
	'name',
	'url',
	'branch',
	'searchPath',
	'notes',
	'confirm'
];
const LOCAL_STEPS: AddResourceWizardStep[] = ['name', 'path', 'notes', 'confirm'];
const CRAN_STEPS: AddResourceWizardStep[] = ['package', 'notes', 'confirm'];

export const stepsForAddResourceType = (resourceType: ResourceType): AddResourceWizardStep[] =>
	resourceType === 'bioconductor'
		? []
		: resourceType === 'git'
			? GIT_STEPS
			: resourceType === 'cran'
				? CRAN_STEPS
				: LOCAL_STEPS;

const getStepInfo = (step: AddResourceWizardStep, resourceType: ResourceType): StepInfo => {
	const gitStepCount = GIT_STEPS.length - 1;
	const localStepCount = LOCAL_STEPS.length - 1;
	const cranStepCount = CRAN_STEPS.length - 1;

	const getStepNumber = (s: AddResourceWizardStep) => {
		if (s === 'type') return 1;
		const steps = stepsForAddResourceType(resourceType);
		return steps.indexOf(s) + 2;
	};

	const totalSteps =
		resourceType === 'git'
			? gitStepCount + 1
			: resourceType === 'cran'
				? cranStepCount + 1
				: localStepCount + 1;

	switch (step) {
		case 'type':
			return {
				title: 'Step 1: Resource Type',
				hint: 'Enter "bioconductor" or "cran" for a package, "git" for a repository, or "local" for a directory',
				placeholder: 'bioconductor, cran, git, or local',
				required: true
			};
		case 'name':
			return {
				title: `Step ${getStepNumber('name')}/${totalSteps}: Resource Name`,
				hint: 'Enter a unique name for this resource (e.g., "localAnalysis" or "packageSource")',
				placeholder: 'resourceName',
				required: true
			};
		case 'url':
			return {
				title: `Step ${getStepNumber('url')}/${totalSteps}: Repository URL`,
				hint: 'Enter the GitHub repository URL',
				placeholder: 'https://github.com/owner/repo',
				required: true
			};
		case 'branch':
			return {
				title: `Step ${getStepNumber('branch')}/${totalSteps}: Branch`,
				hint: 'Enter the branch to clone (press Enter for "main")',
				placeholder: 'main',
				required: false
			};
		case 'searchPath':
			return {
				title: `Step ${getStepNumber('searchPath')}/${totalSteps}: Search Path (Optional)`,
				hint: 'Subdirectory to focus on. Press Enter to skip',
				placeholder: 'e.g., docs or src/components',
				required: false
			};
		case 'path':
			return {
				title: `Step ${getStepNumber('path')}/${totalSteps}: Local Path`,
				hint: 'Enter the absolute path to the local directory',
				placeholder: '/path/to/directory',
				required: true
			};
		case 'package':
			return {
				title: `Step ${getStepNumber('package')}/${totalSteps}: CRAN Package`,
				hint: 'Enter the exact CRAN package name (e.g., "Seurat")',
				placeholder: 'Seurat',
				required: true
			};
		case 'notes':
			return {
				title: `Step ${getStepNumber('notes')}/${totalSteps}: Special Notes (Optional)`,
				hint: 'Any special notes for the AI? Press Enter to skip',
				placeholder: 'e.g., "This is the docs website, not the library"',
				required: false
			};
		case 'confirm':
			return {
				title: 'Confirm',
				hint: 'Press Enter to add this resource, Esc to cancel',
				placeholder: '',
				required: false
			};
	}
};

interface AddResourceWizardProps {
	onClose: () => void;
	onSelectBioconductor: () => void;
	onStepChange: (step: WizardStep) => void;
}

interface WizardValues {
	type: ResourceType | '';
	name: string;
	url: string;
	branch: string;
	searchPath: string;
	path: string;
	package: string;
	notes: string;
}

export const createCranResourceInput = (packageName: string, specialNotes = '') => ({
	type: 'cran' as const,
	name: packageName,
	package: packageName,
	...(specialNotes ? { specialNotes } : {})
});

export const AddResourceWizard = (props: AddResourceWizardProps) => {
	const messages = useMessagesContext();
	const config = useConfigContext();

	const [step, setStep] = useState<AddResourceWizardStep>('type');
	const [values, setValues] = useState<WizardValues>({
		type: '',
		name: '',
		url: '',
		branch: '',
		searchPath: '',
		path: '',
		package: '',
		notes: ''
	});
	const [wizardInput, setWizardInput] = useState('');
	const [error, setError] = useState<string | null>(null);

	const resourceType = useMemo(() => (values.type || 'git') as ResourceType, [values.type]);
	const info = useMemo(() => getStepInfo(step, resourceType), [step, resourceType]);

	useEffect(() => {
		props.onStepChange(step as WizardStep);
	}, [step, props.onStepChange]);

	useKeyboard((key) => {
		if (key.name === 'c' && key.ctrl) {
			if (wizardInput.length === 0) {
				props.onClose();
			} else {
				setWizardInput('');
			}
		}
	});

	usePaste((event) => {
		setWizardInput(event.text);
	});

	const getNextStep = (currentStep: AddResourceWizardStep): AddResourceWizardStep | null => {
		if (currentStep === 'type') return values.type === 'cran' ? 'package' : 'name';
		const steps = stepsForAddResourceType(values.type || 'git');
		const currentIndex = steps.indexOf(currentStep);
		if (currentIndex === -1 || currentIndex >= steps.length - 1) return null;
		return steps[currentIndex + 1]!;
	};

	const handleSubmit = () => {
		const currentStep = step;
		const value = wizardInput.trim();
		const stepInfo = info;

		if (stepInfo.required && !value) {
			setError('This field is required');
			return;
		}
		setError(null);

		if (currentStep === 'type') {
			const lowerValue = value.toLowerCase();
			if (
				lowerValue !== 'bioconductor' &&
				lowerValue !== 'git' &&
				lowerValue !== 'cran' &&
				lowerValue !== 'local'
			) {
				setError('Please enter "bioconductor", "cran", "git", or "local"');
				return;
			}
			if (lowerValue === 'bioconductor') {
					props.onSelectBioconductor();
				return;
			}
			setValues((prev) => ({ ...prev, type: lowerValue as ResourceType }));
			setStep(lowerValue === 'cran' ? 'package' : 'name');
			setWizardInput('');
			return;
		}

		if (currentStep === 'name') {
			setValues((prev) => ({ ...prev, name: value }));
			const next = getNextStep(currentStep);
			if (next) {
				setStep(next);
				setWizardInput(next === 'branch' ? 'main' : '');
			}
			return;
		}

		if (currentStep === 'package') {
			setValues((prev) => ({ ...prev, package: value, name: value }));
			const next = getNextStep(currentStep);
			if (next) {
				setStep(next);
				setWizardInput('');
			}
			return;
		}

		if (currentStep === 'url') {
			setValues((prev) => ({ ...prev, url: value }));
			const next = getNextStep(currentStep);
			if (next) {
				setStep(next);
				setWizardInput(next === 'branch' ? 'main' : '');
			}
			return;
		}

		if (currentStep === 'branch') {
			setValues((prev) => ({ ...prev, branch: value || 'main' }));
			const next = getNextStep(currentStep);
			if (next) {
				setStep(next);
				setWizardInput('');
			}
			return;
		}

		if (currentStep === 'searchPath') {
			setValues((prev) => ({ ...prev, searchPath: value }));
			const next = getNextStep(currentStep);
			if (next) {
				setStep(next);
				setWizardInput('');
			}
			return;
		}

		if (currentStep === 'path') {
			setValues((prev) => ({ ...prev, path: value }));
			const next = getNextStep(currentStep);
			if (next) {
				setStep(next);
				setWizardInput('');
			}
			return;
		}

		if (currentStep === 'notes') {
			setValues((prev) => ({ ...prev, notes: value }));
			setStep('confirm');
		}
	};

	const handleConfirm = async () => {
		const vals = values;

		try {
			await runCliEffect(
				Effect.tryPromise(async () => {
					if (vals.type === 'git') {
						const resource = {
							type: 'git' as const,
							name: vals.name,
							url: vals.url,
							branch: vals.branch || 'main',
							...(vals.searchPath && { searchPath: vals.searchPath }),
							...(vals.notes && { specialNotes: vals.notes })
						};
						await services.addResource(resource);
						const repo: Repo = {
							name: resource.name,
							type: 'git',
							url: resource.url,
							branch: resource.branch,
							specialNotes: resource.specialNotes,
							searchPath: resource.searchPath
						};
						config.addRepo(repo);
						messages.addSystemMessage(`Added git resource: ${resource.name}`);
					} else if (vals.type === 'cran') {
						const resource = createCranResourceInput(vals.package, vals.notes);
						const existing = config.repos.find(
							(candidate) => candidate.name.toLowerCase() === resource.name.toLowerCase()
						);
						if (existing && existing.type !== 'cran') {
							throw new Error(
								`Resource "${resource.name}" already exists as type "${existing.type}". Remove it or choose a different resource name.`
							);
						}
						if (existing) await services.updateResource(resource);
						else await services.addResource(resource);
						config.addRepo({
							name: resource.name,
							type: 'cran',
							url: resource.package,
							branch: 'main',
							package: resource.package,
							specialNotes: resource.specialNotes
						});
						messages.addSystemMessage(
							existing
								? `Updated CRAN package resource: ${resource.name}`
								: `Added CRAN package resource: ${resource.name}`
						);
					} else {
						const resource = {
							type: 'local' as const,
							name: vals.name,
							path: vals.path,
							...(vals.notes && { specialNotes: vals.notes })
						};
						await services.addResource(resource);
						config.addRepo({
							name: resource.name,
							type: 'local',
							url: resource.path,
							branch: 'main',
							specialNotes: resource.specialNotes
						});
						messages.addSystemMessage(`Added local resource: ${resource.name}`);
					}
				})
			);
		} catch (error) {
			messages.addSystemMessage(`Error: ${formatError(error)}`);
		}

		props.onClose();
	};

	useKeyboard((key) => {
		if (key.name === 'escape') {
			props.onClose();
		} else if (key.name === 'return' && step === 'confirm') {
			void handleConfirm();
		}
	});

	const renderConfirmation = () => {
		const vals = values;
		const isGit = vals.type === 'git';
		const isCran = vals.type === 'cran';

		return (
			<box style={{ flexDirection: 'column', paddingLeft: 1 }}>
				<box style={{ flexDirection: 'row' }}>
					<text fg={colors.textMuted} content="Type:   " style={{ width: 12 }} />
					<text fg={colors.accent} content={vals.type} />
				</box>
				<box style={{ flexDirection: 'row' }}>
					<text fg={colors.textMuted} content="Name:   " style={{ width: 12 }} />
					<text fg={colors.text} content={vals.name} />
				</box>
				{isGit ? (
					<>
						<box style={{ flexDirection: 'row' }}>
							<text fg={colors.textMuted} content="URL:    " style={{ width: 12 }} />
							<text fg={colors.text} content={vals.url} />
						</box>
						<box style={{ flexDirection: 'row' }}>
							<text fg={colors.textMuted} content="Branch: " style={{ width: 12 }} />
							<text fg={colors.text} content={vals.branch || 'main'} />
						</box>
						{vals.searchPath ? (
							<box style={{ flexDirection: 'row' }}>
								<text fg={colors.textMuted} content="SearchPath:" style={{ width: 12 }} />
								<text fg={colors.text} content={vals.searchPath} />
							</box>
						) : null}
					</>
				) : isCran ? (
					<box style={{ flexDirection: 'row' }}>
						<text fg={colors.textMuted} content="Package:" style={{ width: 12 }} />
						<text fg={colors.text} content={vals.package} />
					</box>
				) : (
					<box style={{ flexDirection: 'row' }}>
						<text fg={colors.textMuted} content="Path:   " style={{ width: 12 }} />
						<text fg={colors.text} content={vals.path} />
					</box>
				)}
				{vals.notes ? (
					<box style={{ flexDirection: 'row' }}>
						<text fg={colors.textMuted} content="Notes:  " style={{ width: 12 }} />
						<text fg={colors.text} content={vals.notes} />
					</box>
				) : null}
				<text content="" style={{ height: 1 }} />
				<text fg={colors.success} content=" Press Enter to add resource, Esc to cancel" />
			</box>
		);
	};

	return (
		<box
			style={{
				position: 'absolute',
				bottom: 4,
				left: 0,
				width: '100%',
				zIndex: 100,
				backgroundColor: colors.bgRaised,
				border: true,
				borderColor: colors.info,
				flexDirection: 'column',
				padding: 1
			}}
		>
			<text fg={colors.info} content={` Add Resource - ${info.title}`} />
			<text fg={colors.textSubtle} content={` ${info.hint}`} />
			{error ? <text fg={colors.error} content={` ${error}`} /> : null}
			<text content="" style={{ height: 1 }} />

			{step === 'confirm' ? (
				renderConfirmation()
			) : (
				<input
					placeholder={info.placeholder}
					placeholderColor={colors.textSubtle}
					textColor={colors.text}
					value={wizardInput}
					onInput={(v) => {
						setWizardInput(v);
						setError(null);
					}}
					onSubmit={handleSubmit}
					focused
					style={{ width: '100%' }}
				/>
			)}
		</box>
	);
};
