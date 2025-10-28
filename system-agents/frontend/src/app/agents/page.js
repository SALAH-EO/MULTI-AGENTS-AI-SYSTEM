'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../AuthContext';
import ErrorModal from '../components/ErrorModal';

export default function AgentsPage() {
  const { token, loading, logout } = useAuth();
  const router = useRouter();

  // Initial mock agent data
  const initialAgents = [
    {
      id: 'agent-commercial',
      name: 'Commercial Agent',
      isProcessing: false, // New flag: true when agent is typing/in progress
      avatar: 'https://placehold.co/100x100/A855F7/FFFFFF?text=CA',
      chatWebhookUrl: 'http://localhost:5678/webhook/2985bd34-0ed2-4e68-97ac-424f96506cff/chat',
    },
    {
      id: 'data-analyst',
      name: 'Data Analyst',
      isProcessing: false,
      avatar: 'https://placehold.co/100x100/3B82F6/FFFFFF?text=DA',
      chatWebhookUrl: '/api/mock-chat', // Placeholder for mock chat
    },
    {
      id: 'documents-manager',
      name: 'Documents Manager',
      isProcessing: false,
      avatar: 'https://placehold.co/100x100/EF4444/FFFFFF?text=DM',
      chatWebhookUrl: '/api/mock-chat',
    },
    {
      id: 'market-researcher',
      name: 'Market Researcher',
      isProcessing: false,
      avatar: 'https://placehold.co/100x100/22C55E/FFFFFF?text=MR',
      chatWebhookUrl: '/api/mock-chat',
    },
    {
      id: 'zendesk-agent',
      name: 'ZenDesk Agent',
      isProcessing: false,
      avatar: 'https://placehold.co/100x100/F97316/FFFFFF?text=ZA',
      chatWebhookUrl: '/api/mock-chat',
    },
    {
      id: 'slack-manager',
      name: 'Slack Manager',
      isProcessing: false,
      avatar: 'https://placehold.co/100x100/6366F1/FFFFFF?text=SM',
      chatWebhookUrl: '/api/mock-chat',
    },
  ];

  const [agents, setAgents] = useState(initialAgents);
  const [selectedAgentId, setSelectedAgentId] = useState(null); // Store only the ID of the selected agent
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [modal, setModal] = useState({ show: false, message: '', title: '' });
  const messagesEndRef = useRef(null);

  // Derived state: Get the full agent object based on selectedAgentId
  const currentSelectedAgent = selectedAgentId ? agents.find(a => a.id === selectedAgentId) : null;

  const showErrorModal = (title, message = '') => {
    setModal({ show: true, title, message });
  };

  const closeModal = () => {
    setModal({ show: false, title: '', message: '' });
  };

  // Scroll to the latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !token) {
      router.push('/login');
    }
  }, [token, loading, router]);

  const handleAgentClick = (agentId) => {
    setSelectedAgentId(agentId); // Set the ID
    setMessages([]); // Clear messages when switching agents
    setNewMessage('');
    const agent = agents.find(a => a.id === agentId);
    if (agent) {
      // Simulate initial chat message from agent
      setTimeout(() => {
        setMessages([{ sender: agent.name, text: `Hello! How can I help you today?`, isAgent: true }]);
      }, 300);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentSelectedAgent) return;

    const userMessage = { sender: 'You', text: newMessage, isAgent: false };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setNewMessage('');

    // Set the selected agent's isProcessing to true
    setAgents(prevAgents => prevAgents.map(a =>
      a.id === currentSelectedAgent.id ? { ...a, isProcessing: true } : a
    ));

    // Add a typing message to the chat itself
    const typingMessage = { sender: currentSelectedAgent.name, text: 'Typing...', isAgent: true, isTyping: true };
    setMessages((prevMessages) => [...prevMessages, typingMessage]);

    let agentResponseText = "I'm sorry, I couldn't process that. Please try again.";

    try {
      if (currentSelectedAgent.id === 'agent-commercial') {
        // Direct interaction with the n8n webhook for Agent Commercial
        const response = await fetch(currentSelectedAgent.chatWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: newMessage }),
        });

        if (response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            console.log("Received data from n8n webhook:", data); // Log the full data

            let extractedResponse = '';
            if (typeof data === 'string') {
              extractedResponse = data;
            } else if (typeof data === 'object' && data !== null) {
              // Try common keys for direct string response
              if (data.response) {
                extractedResponse = data.response;
              } else if (data.text) {
                extractedResponse = data.text;
              } else if (data.message) {
                extractedResponse = data.message;
              } else if (data.output && typeof data.output === 'string') { // Check for a direct 'output' string
                extractedResponse = data.output;
              } else if (Array.isArray(data) && data.length > 0) {
                // If it's an array, try to find a message in the first item
                const firstItem = data[0];
                if (typeof firstItem === 'string') {
                  extractedResponse = firstItem;
                } else if (typeof firstItem === 'object' && firstItem !== null) {
                  extractedResponse = firstItem.response || firstItem.text || firstItem.message || firstItem.output || JSON.stringify(firstItem);
                }
              } else {
                // Fallback to stringifying the whole object if no specific key found
                extractedResponse = JSON.stringify(data, null, 2);
              }
            }

            if (!extractedResponse || extractedResponse.trim() === '') {
                agentResponseText = "No specific response from Agent Commercial (empty or unparseable response).";
            } else {
                agentResponseText = extractedResponse;
            }

          } else {
            // If response is not JSON, treat it as plain text
            agentResponseText = await response.text();
            console.log("Received plain text from n8n webhook:", agentResponseText); // Log plain text
          }

          if (!agentResponseText || agentResponseText.trim() === '') {
              agentResponseText = "No specific response from Agent Commercial (empty or unparseable response).";
          }

        } else {
          // Attempt to parse error message from response body
          let errorDetail = `Error: ${response.status} ${response.statusText}`;
          try {
            const errorData = await response.json();
            errorDetail = errorData.message || errorData.detail || JSON.stringify(errorData);
          } catch (parseError) {
            // If response is not JSON, use statusText
            console.error("Failed to parse error response from n8n:", parseError);
          }
          agentResponseText = `Error from Agent Commercial: ${errorDetail}. Please check n8n workflow.`;
          showErrorModal('Chat Error', agentResponseText); // Show modal for server errors
        }
      } else {
        // Mock responses for other agents with a simulated delay
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate 2-second delay
        if (newMessage.toLowerCase().includes('hello')) {
          agentResponseText = `Hi there! How can I assist you as a ${currentSelectedAgent.name}?`;
        } else if (newMessage.toLowerCase().includes('report')) {
          agentResponseText = `Generating a report for you now, as a ${currentSelectedAgent.name}.`;
        } else {
          agentResponseText = `Understood. As a ${currentSelectedAgent.name}, I'm here to help with your request.`;
        }
      }

    } catch (error) {
      console.error('Error sending message:', error);
      showErrorModal('Chat Error', `Failed to send message: ${error.message}`);
      agentResponseText = 'Error: Could not get a response.'; // Set error message for chat
    } finally {
      // Remove typing message and add actual response (or error message)
      setMessages((prevMessages) =>
        prevMessages.filter(msg => !msg.isTyping).concat({ sender: currentSelectedAgent.name, text: agentResponseText, isAgent: true })
      );

      // Set the selected agent's isProcessing back to false
      setAgents(prevAgents => prevAgents.map(a =>
        a.id === currentSelectedAgent.id ? { ...a, isProcessing: false } : a
      ));
    }
  };

  if (loading || !token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <p className="text-gray-700 dark:text-gray-300">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-8 pt-20">
      <header className="fixed top-0 left-0 right-0 z-50 bg-gray-800 text-white p-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <a href="/" className="text-white hover:text-gray-300 transition-colors"> 
          <img
            src="/images.png"
            alt="OFFZONE Logo"
            className="h-10 w-10 rounded-full object-cover ring-2 ring-blue-400"
            style={{ background: 'white' }}
          />
          </a>
          <h1 className="text-lg font-bold">OFFZONE AI SYSTEM</h1>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.push('/')}
            className="py-1 px-3 bg-blue-600 rounded-md hover:bg-blue-700 transition-colors text-sm"
          >
            Dashboard
          </button>
          
          <button
            onClick={logout}
            className="logout-btn"
            title="Logout"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M18 15l3-3m0 0l-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </header>

      <h1 className="text-4xl font-bold mb-8 text-center">Agent Interaction</h1>

      <ErrorModal show={modal.show} title={modal.title} message={modal.message} onClose={closeModal} />

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Agents List */}
        <div className="lg:w-1/3 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6">
          <h2 className="text-2xl font-semibold mb-6 text-gray-800 dark:text-gray-100">Your Agents</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className={`flex flex-col items-center p-4 rounded-lg cursor-pointer transition-all duration-200
                            ${currentSelectedAgent?.id === agent.id ? 'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500' : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'}
                            relative`}
                onClick={() => handleAgentClick(agent.id)}
              >
                <div className="relative">
                  <img
                    src={agent.avatar}
                    alt={agent.name}
                    className="w-20 h-20 rounded-full object-cover border-2 border-gray-300 dark:border-gray-600"
                  />
                  {/* Green dot now indicates isProcessing */}
                  {agent.isProcessing && (
                    <span className="absolute bottom-0 right-0 block h-4 w-4 rounded-full bg-green-500 ring-2 ring-white dark:ring-gray-800"></span>
                  )}
                </div>
                <p className="mt-3 text-sm font-medium text-gray-800 dark:text-gray-100 text-center">
                  {agent.name}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Interface */}
        <div className="lg:w-2/3 bg-white dark:bg-gray-800 rounded-lg shadow-xl flex flex-col">
          {currentSelectedAgent ? (
            <>
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center space-x-4">
                <img
                  src={currentSelectedAgent.avatar}
                  alt={currentSelectedAgent.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                  Chat with {currentSelectedAgent.name}
                </h2>
              </div>
              <div className="flex-1 p-4 overflow-y-auto custom-scrollbar" style={{ maxHeight: 'calc(100vh - 350px)' }}> {/* Adjust height dynamically */}
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex mb-4 ${msg.isAgent ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[70%] p-3 rounded-lg shadow-md ${
                        msg.isAgent
                          ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-none'
                          : 'bg-blue-500 text-white rounded-br-none'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center space-x-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm
                             bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100
                             focus:ring-blue-500 focus:border-blue-500"
                  disabled={currentSelectedAgent.isProcessing} // Disable input if agent is processing
                />
                <button
                  type="submit"
                  className={`px-6 py-3 rounded-lg shadow-md transition-colors duration-200
                              ${currentSelectedAgent.isProcessing ? 'bg-gray-400 text-gray-700 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                  disabled={currentSelectedAgent.isProcessing} // Disable button if agent is processing
                >
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
              Select an agent to start chatting.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
