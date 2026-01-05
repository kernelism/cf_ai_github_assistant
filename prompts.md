```
Since the AI calls are happening to Llama 70b, its a bit not great on tool calling. it either hallucinates or tells it doesn't know with references as the api links given. I want to move tool calling outside llm. We simply call llm once and ask what apis to call, call them, and then revert the output back to the llm and get final answer. 

For example, it might need list of files first, then contents of specific files and then finally the result. 

Update prompts, worker and flow accordingly. If any doubts, consult offical cloudflare agents docs and then proceed. Do not assume anything. Do not change anything else. @github-assistant/worker/utils.ts @github-assistant/worker/index.ts 
```

```
I want an application that can do something more than all these GPT style applications can do. 

i want it to be able to find new issues for me, find files rleevant to the issues and debug it and be an overall contribution assistant. Do whatever change you have to do to achieve a result like this. 

my suggestion:
I want a full revamp of the system. When Indexing happens, I want you to collect all relevant informaiton and store it in cache. Keep ttl as 30 minutes and fallback for re recording the information again. 

Now, for each request question, find the appropriate content tokens and then return final llm response. Also the markdown formatting is very ugly update it. 

I want high quality responses for any question asked. 

Do the objectively best thing to get best results.
```

```
Show the plan of though on screen. What file you're fetching, what task ur doing etc.

Change "U" to "You"

The markdown formatting is not so good. Looks crowded with text.

Show as many relevant code snippets in the output as possible. 
```

```
update README.md with complete info

1. About
2. Setup for local
3. Features
4. How to use?

Do not use emojis. Consult documentation
```