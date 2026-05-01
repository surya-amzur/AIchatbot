export type User = {
	id: string;
	email: string;
	name: string;
};

export type LoginSuccessResponse = {
	status: string;
};

export type Message = {
	id: string;
	role: "user" | "assistant";
	content: string;
	created_at: string;
};

export type ChatHistoryResponse = {
	thread_id: string;
	messages: Message[];
};

export type ChatThreadSummary = {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
	last_message: string | null;
};

export type ChatThreadsResponse = {
	threads: ChatThreadSummary[];
};

export type ManualSignupPayload = {
	email: string;
	name: string;
	password: string;
};

export type ManualLoginPayload = {
	email: string;
	password: string;
};
