'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext'; // Import useAuth
import ErrorModal from './components/ErrorModal'; // Import the ErrorModal component
import AuditDetailModal from './components/AuditDetailModal'; // Import the AuditDetailModal component
import './styles.css';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

export default function Home() {
  const { token, user, loading, logout } = useAuth(); // Get token, user, loading, and logout from AuthContext
  const router = useRouter();

  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
  const selectedWorkflowIdRef = useRef(selectedWorkflowId); 
  useEffect(() => {
    selectedWorkflowIdRef.current = selectedWorkflowId;
  }, [selectedWorkflowId]);

  const [workflowData, setWorkflowData] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [allNodes, setAllNodes] = useState([]); // Keep track of all nodes for enable/disable/remove
  const [executions, setExecutions] = useState([]);
  const [audit, setAudit] = useState(null);
  const [modal, setModal] = useState({ show: false, message: '', title: '' });
  const [isActive, setIsActive] = useState(false);
  const isFetching = useRef(false);

  const [latestWorkflowRealtimeData, setLatestWorkflowRealtimeData] = useState(null);
  const workflowSocketRef = useRef(null);

  const [chartData, setChartData] = useState([]);
  const [mongoOutputData, setMongoOutputData] = useState([]);
  const [lineChartData, setLineChartData] = useState([]);

  const [auditChartData, setAuditChartData] = useState([]);
  const [fullAuditDetailsMap, setFullAuditDetailsMap] = useState({});
  const [selectedWorkflowAuditDetails, setSelectedWorkflowAuditDetails] = useState(null);
  const [showAuditDetailModal, setShowAuditDetailModal] = useState(false);

  const PIE_CHART_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28DFF', '#FF6B6B', '#6BFFB8', '#FFD166', '#83A6ED', '#8DD1E1', '#82CA9D', '#A4DE6C', '#D0ED57', '#FFC658'];

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !token) {
      router.push('/login');
    }
  }, [token, loading, router]);

  const showErrorModal = (title, message = '') => {
    setModal({ show: true, title, message });
  };

  const closeModal = () => {
    setModal({ show: false, title: '', message: '' });
  };

  const getNodeIcon = (name) => {
    const iconMap = {
      'When chat message received': '💬',
      'AI Agent': '🤖',
      'Ollama Chat Model': '🧠',
      'Click Trigger': '🖱️',
      'Google Drive': '📖',
      'Qdrant Vector Store': '🗄️',
      'Embeddings Ollama': '🧠',
      'Default Data Loader': '📄',
      'Recursive Character Text Splitter': '✂️',
      'Question and Answer Chain': '❓',
      'Vector Store Retriever': '🔍',
      'Qdrant Vector Store1': '🗄️',
      'Embeddings Ollama1': '🧠',
      'Slack Trigger': '📡',
    };
    return iconMap[name.replace(/\*/g, '').trim()] || '⚙️';
  };

  const getDynamicTableHeaders = (dataObject) => {
    if (!dataObject || typeof dataObject !== 'object') return [];
    const validKeys = Object.keys(dataObject).filter(key => {
      const value = dataObject[key];
      if (value === null || typeof value === 'undefined') return false;
      if (typeof value === 'object' && Object.keys(value).length === 0) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    });
    return validKeys.sort();
  };

  const renderDynamicCellContent = (data) => {
    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data)) {
        return (
          <ul className="list-none p-0 m-0 text-xs">
            {data.map((item, idx) => (
              <li key={idx} className="mb-1">
                {typeof item === 'object' && item !== null ? (
                  <>
                    <span className="font-semibold">{item.name || `Item ${idx + 1}`}</span>
                    <ul className="list-none pl-4 m-0">
                      {Object.entries(item).map(([key, value]) => (
                        <li key={key} className="text-xs">
                          <span className="font-medium">{key}: </span>
                          {Array.isArray(value) ? value.join(', ') : (typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value))}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  String(item)
                )}
              </li>
            ))}
          </ul>
        );
      } else {
        return (
          <ul className="list-none p-0 m-0 text-xs">
                          {Object.entries(data).map(([key, value]) => (
                            <li key={key} className="mb-1">
                              <span className="font-medium">{key}: </span>
                              {Array.isArray(value) ? value.join(', ') : (typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value))}
                            </li>
                          ))}
          </ul>
        );
      }
    }
    return String(data);
  };

  // Initial fetch of workflows on component mount
  useEffect(() => {
    if (token) { // Only fetch if authenticated
      // Use process.env.NEXT_PUBLIC_BACKEND_URL for API calls
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/workflows`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(res => {
          if (!res.ok) {
            if (res.status === 401) {
              logout(); // Log out if token is invalid or expired
              throw new Error('Unauthorized. Please log in again.');
            }
            throw new Error(res.status === 500 ? 'Server error' : `Failed to load workflows (Status: ${res.status}).`);
          }
          return res.json();
        })
        .then(data => {
          if (data.error) throw new Error(data.error || 'Error loading workflow data');
          setWorkflows(data);
          if (data.length > 0) setSelectedWorkflowId(data[0].id);
        })
        .catch(err => showErrorModal('Error', err.message || 'Failed to connect to the server.'));
    }
  }, [token, logout]); // Re-run when token changes

  // Effect to handle workflow selection changes (main cleanup and data fetching)
  useEffect(() => {
    if (selectedWorkflowId && !isFetching.current && token) { // Only fetch if authenticated
      isFetching.current = true;
      console.log(`Switching to workflow: ${selectedWorkflowId}`);

      setExecutions([]);
      setLatestWorkflowRealtimeData(null);
      setMongoOutputData([]);
      setLineChartData([]);

      // The WebSocket cleanup is now handled by the separate useEffect below,
      // so we remove the direct close here to avoid race conditions.
      // if (workflowSocketRef.current) {
      //   console.log(`Closing workflow WebSocket for previous workflow.`);
      //   workflowSocketRef.current.close();
      //   workflowSocketRef.current = null;
      // }

      Promise.all([
        fetchWorkflowDetails(selectedWorkflowId),
        fetchExecutions(selectedWorkflowId), // This now calls the backend endpoint
        fetchMongoOutputData(selectedWorkflowId),
      ]).finally(() => {
        isFetching.current = false;
      });
    }
  }, [selectedWorkflowId, token]); // Re-run this effect when selectedWorkflowId or token changes

  // Effect for real-time workflow updates via WebSocket
  useEffect(() => {
    let ws = null; // Declare ws here to be accessible in cleanup

    if (selectedWorkflowId && token) { // Only connect if authenticated
      // Ensure any existing socket is closed before creating a new one
      if (workflowSocketRef.current && workflowSocketRef.current.readyState === WebSocket.OPEN) {
        console.log(`Closing existing workflow WebSocket for workflow: ${selectedWorkflowId} before creating new.`);
        workflowSocketRef.current.close();
      }
      workflowSocketRef.current = null; // Clear ref immediately

      // Corrected WebSocket URL construction to use NEXT_PUBLIC_BACKEND_URL
      // This ensures the browser connects to the exposed host port, not internal Docker IP
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      const wsProtocol = backendUrl.startsWith('https') ? 'wss:' : 'ws:';
      const wsHost = new URL(backendUrl).hostname; // Extracts 'localhost' or '127.0.0.1'
      const wsPort = new URL(backendUrl).port; // Extracts '8000'

      const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}/ws/workflow_updates/${selectedWorkflowId}`;
      
      console.log(`Attempting to connect WebSocket to: ${wsUrl}`);

      ws = new WebSocket(wsUrl); // Assign to local ws variable
      workflowSocketRef.current = ws; // Update ref

      ws.onopen = () => {
        console.log(`Connected to workflow WebSocket: ${selectedWorkflowId}`); 
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log(`Workflow WS received data:`, data);
          // Use selectedWorkflowIdRef.current for consistency with the latest selected workflow
          if (data.workflowId && data.workflowId === selectedWorkflowIdRef.current) { 
            console.log(`Processing workflow data for ${selectedWorkflowIdRef.current}:`, data);
            
            let processedInput = data.input;
            if (typeof data.input === 'string') {
                try { processedInput = JSON.parse(data.input); } catch (e) { /* Not a JSON string, keep as is */ }
            }
            let processedOutput = data.output;
            if (typeof data.output === 'string') {
                try { processedOutput = JSON.parse(data.output); } catch (e) { /* Not a JSON string, keep as is */ }
            }

            setLatestWorkflowRealtimeData({
                ...data,
                input: processedInput,
                output: processedOutput
            });

            setExecutions(prevExecutions => {
              const newExData = {
                id: String(data.executionId),
                workflowId: data.workflowId,
                finished: data.finished, 
                mode: data.mode || (prevExecutions.find(ex => ex.id === String(data.executionId))?.mode || 'realtime_update'),
                startedAt: data.timestamp || (prevExecutions.find(ex => ex.id === String(data.executionId))?.startedAt || new Date().toISOString()),
                stoppedAt: data.finished ? new Date().toISOString() : null,
              };

              const existingIndex = prevExecutions.findIndex(ex => ex.id === newExData.id);

              if (existingIndex !== -1) {
                const updatedExecutions = [...prevExecutions];
                updatedExecutions[existingIndex] = {
                  ...updatedExecutions[existingIndex],
                  ...newExData
                };
                return updatedExecutions;
              } else {
                return [newExData, ...prevExecutions];
              }
          });

          // Fix for "two children with the same key" - update existing mongoOutputData entries
          if (data.output) {
            setMongoOutputData(prevData => {
              const newMongoEntry = {
                timestamp: data.timestamp || new Date().toISOString(),
                executionId: data.executionId,
                output: processedOutput
              };
              const existingMongoIndex = prevData.findIndex(entry => entry.executionId === newMongoEntry.executionId);

              if (existingMongoIndex !== -1) {
                const updatedMongoData = [...prevData];
                updatedMongoData[existingMongoIndex] = {
                  ...updatedMongoData[existingMongoIndex],
                  ...newMongoEntry
                };
                return updatedMongoData;
              } else {
                return [newMongoEntry, ...prevData];
              }
            });
          }

          } else {
            console.warn(`Ignoring workflow data for workflow ${data.workflowId || 'undefined'}; selected: ${selectedWorkflowIdRef.current}`); 
          }
        } catch (error) {
          console.error("Failed to parse workflow data:", error);
        }
      };

      ws.onclose = (event) => {
        console.log(`Workflow WebSocket closed for ${selectedWorkflowId}. Code: ${event.code}, Reason: ${event.reason}`);
        // Do NOT set workflowSocketRef.current = null here.
        // It should only be set to null in the cleanup function to avoid race conditions.
      };

      ws.onerror = (error) => {
        console.error('Workflow WebSocket error:', error);
      };

      return () => {
        // This cleanup function runs when the component unmounts OR
        // when selectedWorkflowId or token changes (before the new effect runs)
        if (ws && ws.readyState === WebSocket.OPEN) {
          console.log(`Cleanup: Closing workflow WebSocket for workflow: ${selectedWorkflowId}`);
          ws.close();
        }
        // Only set the ref to null in the cleanup
        workflowSocketRef.current = null;
      };
    } else {
      // If selectedWorkflowId or token becomes null/undefined, ensure cleanup
      if (workflowSocketRef.current && workflowSocketRef.current.readyState === WebSocket.OPEN) {
        console.log(`Closing workflow WebSocket due to no selected workflow or token`);
        workflowSocketRef.current.close();
      }
      workflowSocketRef.current = null; // Clear ref
    }
  }, [selectedWorkflowId, token]); // Re-run this effect when selectedWorkflowId or token changes

  useEffect(() => {
    const processChartData = (executions) => {
      const dailyData = {};

      executions.forEach(ex => {
        if (ex.mode === 'manual') {
          return;
        }

        const date = new Date(ex.startedAt).toLocaleDateString('en-CA');
        if (!dailyData[date]) {
          dailyData[date] = { date, successful: 0, other: 0 };
        }
        
        if (ex.finished === true) {
          dailyData[date].successful += 1;
        } else {
          dailyData[date].other += 1;
        }
      });

      const sortedDates = Object.keys(dailyData).sort((a, b) => new Date(a) - new Date(b));
      return sortedDates.map(date => dailyData[date]);
    };

    setChartData(processChartData(executions));
  }, [executions]);

  useEffect(() => {
    const processLineChartData = (data) => {
      const dailyDataCount = {};
      data.forEach(entry => {
        const date = new Date(entry.timestamp).toLocaleDateString('en-CA');
        if (!dailyDataCount[date]) {
          dailyDataCount[date] = { date, count: 0 };
        }
        dailyDataCount[date].count += 1;
      });

      const sortedDates = Object.keys(dailyDataCount).sort((a, b) => new Date(a) - new Date(b));
      return sortedDates.map(date => dailyDataCount[date]);
    };

    setLineChartData(processLineChartData(mongoOutputData));
  }, [mongoOutputData]);

  const processAuditData = (auditReport) => {
    const workflowRiskMap = {};

    for (const reportType in auditReport) {
      if (auditReport.hasOwnProperty(reportType)) {
        const report = auditReport[reportType];
        if (report.sections) {
          report.sections.forEach(section => {
            if (section.location) {
              section.location.forEach(loc => {
                if (loc.kind === 'node' && loc.workflowName && loc.nodeName) {
                  const workflowName = loc.workflowName;
                  const nodeName = loc.nodeName;

                  if (!workflowRiskMap[workflowName]) {
                    workflowRiskMap[workflowName] = { totalRisks: 0, nodes: {} };
                  }
                  workflowRiskMap[workflowName].totalRisks += 1;
                  workflowRiskMap[workflowName].nodes[nodeName] = (workflowRiskMap[workflowName].nodes[nodeName] || 0) + 1;
                }
              });
            }
          });
        }
      }
    }

    const chartData = Object.keys(workflowRiskMap).map(workflowName => ({
      name: workflowName,
      value: workflowRiskMap[workflowName].totalRisks,
    }));

    return { chartData, workflowRiskMap };
  };

  useEffect(() => {
    if (audit) {
      const { chartData, workflowRiskMap } = processAuditData(audit);
      setAuditChartData(chartData);
      setFullAuditDetailsMap(workflowRiskMap);
    }
  }, [audit]);

  const onPieClick = (data, index) => {
    const workflowName = data.name;
    const details = fullAuditDetailsMap[workflowName];
    if (details) {
      setSelectedWorkflowAuditDetails({
        workflowName: workflowName,
        nodes: Object.entries(details.nodes).map(([nodeName, riskCount]) => ({ nodeName, riskCount }))
      });
      setShowAuditDetailModal(true);
    }
  };

  const fetchWorkflowDetails = async (workflowId) => {
    try {
      // Use process.env.NEXT_PUBLIC_BACKEND_URL for API calls
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/workflows/${workflowId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) logout();
        throw new Error(`Failed to load workflow details (Status: ${res.status}).`);
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error || 'Invalid workflow data');
      }
      console.log("Workflow Data:", JSON.stringify(data, null, 2));
      setWorkflowData(data);
      setAllNodes(data.nodes || []);
      setNodes(data.nodes?.filter(node => node.name.includes('*')) || []);
      setIsActive(data.active || false);
    } catch (err) {
      showErrorModal('Error Loading Workflow', err.message);
    }
  };

  const fetchExecutions = async (workflowId) => {
    try {
      // Use process.env.NEXT_PUBLIC_BACKEND_URL for API calls
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/workflows/${workflowId}/executions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) logout();
        throw new Error(`Failed to load executions (Status: ${res.status}).`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error || 'Invalid execution data');
      
      console.log(`Fetched executions for workflow ${workflowId}:`, data);
      setExecutions(data);
    } catch (err) {
      showErrorModal('Error Loading Executions', err.message);
    }
  };

  const fetchMongoOutputData = async (workflowId) => {
    try {
      // Use process.env.NEXT_PUBLIC_BACKEND_URL for API calls
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/mongodb/workflows/${workflowId}/data`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) logout();
        throw new Error(`Failed to load MongoDB data (Status: ${res.status}).`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error || 'Invalid MongoDB data');
      console.log(`Fetched MongoDB output data for workflow ${workflowId}:`, data);
      setMongoOutputData(data);
    } catch (err) {
      showErrorModal('Error Loading MongoDB Data', err.message);
    }
  };

  const handleToggleActive = async () => {
    const endpoint = isActive ? `/api/workflows/${selectedWorkflowId}/deactivate` : `/api/workflows/${selectedWorkflowId}/activate`;
    try {
      // Use process.env.NEXT_PUBLIC_BACKEND_URL for API calls
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        let errorData = {};
        try {
          errorData = await res.json();
        } catch {
          errorData = { detail: await res.text() || "Unknown server response" };
        }
        const errorMessage = errorData.message || errorData.detail || errorData.error || "Unknown error";
        if (res.status === 401) logout();
        if (res.status === 500) throw new Error('Server error');
        if (res.status === 400 && errorMessage.toLowerCase().includes("trigger")) {
          throw new Error("This agent cannot be activated because it has no trigger nodes.");
        }
        throw new Error(`Failed to ${isActive ? 'deactivate' : 'activate'} agent: ${errorMessage}`);
      }
      setIsActive(!isActive);
      setWorkflows(workflows => workflows.map(wf => wf.id === selectedWorkflowId ? { ...wf, active: !isActive } : wf));
      setWorkflowData({ ...workflowData, active: !isActive });
    } catch (err) {
      showErrorModal('Agent Activation Error', err.message);
    }
  };

  const removeNodeConnections = (nodeId, connections) => {
    const updatedConnections = { ...connections };
    Object.keys(updatedConnections).forEach(key => {
      const nodeConnections = updatedConnections[key];
      if (Array.isArray(nodeConnections)) {
        updatedConnections[key] = nodeConnections.filter(conn => !conn.some(c => c.node === nodeId));
        if (updatedConnections[key].length === 0) delete updatedConnections[key];
      } else {
        delete updatedConnections[key];
      }
    });
    return updatedConnections;
  };

  const handleRemoveNode = async (nodeId) => {
    if (!nodeId) return showErrorModal('Invalid Action', "Please select a node to remove.");
    const updatedAllNodes = allNodes.filter(node => node.id !== nodeId);
    const updatedNodes = nodes.filter(node => node.id !== nodeId);
    setNodes(updatedNodes);
    try {
      const payload = {
        name: workflowData.name,
        nodes: updatedAllNodes.map(node => ({
          ...node,
          typeVersion: Math.floor(node.typeVersion),
          position: node.position.map(coord => Math.floor(coord)),
        })),
        connections: removeNodeConnections(nodeId, workflowData.connections || {}),
        settings: {
          saveExecutionProgress: false,
          saveDataManualExecutions: true,
          saveDataErrorExecution: "all",
          saveDataSuccessExecution: "all",
          executionTimeout: 3600,
          timezone: "UTC",
          executionOrder: "v1",
          ...(workflowData.settings || {})
        }
      };
      console.log("Remove Node Payload:", JSON.stringify(payload, null, 2));
      // Use process.env.NEXT_PUBLIC_BACKEND_URL for API calls
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/workflows/${selectedWorkflowId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let errorData = {};
        try {
          errorData = await res.json();
        } catch {
          errorData = { detail: await res.text() || "Unknown server response" };
        }
        if (res.status === 401) logout();
        if (res.status === 500) throw new Error('Server error');
        let errorMessage = errorData.detail || errorData.message || 'Invalid request';
        if (Array.isArray(errorData.detail)) errorMessage = errorData.detail.map(err => err.msg).join('; ');
        throw new Error(errorMessage);
      }
      const responseData = await res.json();
      console.log("Toggle Node Response:", JSON.stringify(responseData, null, 2));
      setAllNodes(updatedAllNodes);
      setNodes(updatedAllNodes.filter(node => node.name.includes('*')) || []);
      setWorkflowData({ ...responseData, nodes: updatedAllNodes });
    } catch (err) {
      showErrorModal('Node Removal Error', err.message);
      setNodes(nodes);
    }
  };

  const handleToggleNode = async (nodeId) => {
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) return showErrorModal('Invalid Node', "Node not found.");
    const updatedAllNodes = allNodes.map(n => n.id === nodeId ? { ...n, disabled: !n.disabled } : n);
    const updatedNodes = nodes.map(n => n.id === nodeId ? { ...n, disabled: !n.disabled } : n);
    setNodes(updatedNodes);
    try {
      const payload = {
        name: workflowData.name,
        nodes: updatedAllNodes.map(node => ({
          ...node,
          typeVersion: Math.floor(node.typeVersion),
          position: node.position.map(coord => Math.floor(coord)),
        })),
        connections: workflowData.connections || {},
        settings: {
          saveExecutionProgress: false,
          saveManualExecutions: true,
          saveDataErrorExecution: "all",
          saveDataSuccessExecution: "all",
          executionTimeout: 3600,
          timezone: "UTC",
          executionOrder: "v1",
          ...(workflowData.settings || {})
        }
      };
      console.log("Toggle Node Payload:", JSON.stringify(payload, null, 2));
      // Use process.env.NEXT_PUBLIC_BACKEND_URL for API calls
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/workflows/${selectedWorkflowId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let errorData = {};
        try { errorData = await res.json(); } catch {
          errorData = { detail: await res.text() || "Unknown server response" };
        }
        if (res.status === 401) logout();
        if (res.status === 500) throw new Error('Server error');
        let errorMessage = errorData.detail || errorData.message || 'Invalid request';
        if (Array.isArray(errorData.detail)) errorMessage = errorData.detail.map(err => err.msg).join('; ');
        throw new Error(errorMessage);
      }
      const responseData = await res.json();
      console.log("Toggle Node Response:", JSON.stringify(responseData, null, 2));
      setAllNodes(updatedAllNodes);
      setNodes(updatedAllNodes.filter(node => node.name.includes('*')) || []);
      setWorkflowData({ ...responseData, nodes: updatedAllNodes });
    } catch (err) {
      showErrorModal('Node Toggle Error', `Failed to ${node.disabled ? 'enable' : 'disable'} node: ${err.message}`);
      setNodes(nodes);
    }
  };

  const handleGenerateAudit = async () => {
    try {
      // Use process.env.NEXT_PUBLIC_BACKEND_URL for API calls
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/audit`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) logout();
        throw new Error(`Failed to generate audit (Status: ${res.status}).`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAudit(data);
    } catch (err) {
      showErrorModal('Audit Generation Error', err.message);
    }
  };

  const handleLogout = () => {
    logout(); // Call logout from AuthContext
  };

  const getAllOutputHeaders = (data) => {
    const headers = new Set();
    data.forEach(entry => {
      if (entry.output && typeof entry.output === 'object') {
        Object.keys(entry.output).forEach(key => headers.add(key));
      }
    });
    headers.add('timestamp');
    headers.add('executionId');
    return Array.from(headers).sort();
  };

  const allMongoOutputHeaders = getAllOutputHeaders(mongoOutputData);

  // Show loading state or redirect if not authenticated
  if (loading || !token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <p className="text-gray-700 dark:text-gray-300">Loading authentication...</p>
      </div>
    );
  }

  return (
    <>
      {/* Added fixed, top-0, left-0, right-0, z-50 for sticky header */}
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
          {user && user.role === 'admin' && (
            <button
              onClick={() => router.push('/admin')}
              className="py-1 px-3 bg-blue-600 rounded-md hover:bg-blue-700 transition-colors text-sm"
            >
              Admin Panel
            </button>
          )}

          {user && user.role === 'user' && (
            <button
              Tooltip="Chat with Agents"
              onClick={() => router.push('/agents')}
              className="py-1 px-3 bg-blue-600 rounded-md hover:bg-blue-700 transition-colors text-sm"
            >
             <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" fill="currentColor" class="bi bi-chat" viewBox="0 0 16 16">
  <path d="M2.678 11.894a1 1 0 0 1 .287.801 11 11 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8 8 0 0 0 8 14c3.996 0 7-2.807 7-6s-3.004-6-7-6-7 2.808-7 6c0 1.468.617 2.83 1.678 3.894m-.493 3.905a22 22 0 0 1-.713.129c-.2.032-.352-.176-.273-.362a10 10 0 0 0 .244-.637l.003-.01c.248-.72.45-1.548.524-2.319C.743 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7a9 9 0 0 1-2.347-.306c-.52.263-1.639.742-3.468 1.105"/>
</svg>

            </button>
          )}
          
          {/* Removed welcome statement */}
          <button
            onClick={handleLogout}
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
      {/* Add padding-top to main content to prevent it from being hidden behind the fixed header */}
      <main className="container mx-auto p-6 max-w-5xl pt-20"> {/* Adjusted pt-20 for header height */}
        <h1 className="text-4xl font-bold mb-10 text-center text-gray-800 dark:text-gray-100">Agents Management</h1>
        <ErrorModal show={modal.show} title={modal.title} message={modal.message} onClose={closeModal} />
        {workflows.length === 0 ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">No workflows found.</div>
          ) : (
            <div className="space-y-8">
              <div className="relative">
                <select
                  className="w-full p-3 border rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-sm focus:ring-2 focus:ring-blue-500"
                  value={selectedWorkflowId || ''}
                  onChange={(e) => setSelectedWorkflowId(e.target.value)}
                >
                  {/* Corrected: Display workflow.name, use workflow.id as value */}
                  {workflows.map((wf) => <option key={wf.id} value={wf.id}>{wf.name}</option>)}
                </select>
              </div>
              {workflowData && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">{workflowData.name}</h2>
                    <label className="toggle-container">
                      <input type="checkbox" className="toggle-checkbox" checked={isActive} onChange={handleToggleActive} />
                      <span className="toggle-label"></span>
                    </label>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 grid grid-cols-2 gap-2">
                    <p><strong>ID:</strong> {workflowData.id}</p>
                    <p><strong>Created:</strong> {new Date(workflowData.createdAt).toLocaleString()}</p>
                    <p><strong>Updated:</strong> {new Date(workflowData.updatedAt).toLocaleString()}</p>
                  </div>
                  {selectedWorkflowId === "23PcTjiy2sdStZ15" && (
<section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
  <div className="flex flex-col items-center gap-6">
    <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden shadow-sm w-full max-w-[500px]">
      <iframe
        src="http://localhost:5678/form/Agent"
        title="Agent Commercial Form"
        width="500px"
        height="600px"
        style={{ border: 'none' }}
      ></iframe>
    </div>

    <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-auto shadow-sm w-full max-w-[1200px]">
      <iframe
        src="https://docs.google.com/spreadsheets/d/e/2PACX-1vQoMoQgiB4iVjX48b03QOGSQDf_5gwdPqepudbwSk6NxTxDbVtM_U3lWkvK6FRZFjTXl762X2cGjsRK/pubhtml?widget=true&amp;headers=false"
        title="Google Sheet - Clean View"
        width="1200px"
        height="500px"
        style={{ border: 'none' }}
        className="block"
      ></iframe>
    </div>
  </div>
</section>

)}
                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Nodes</h3>
                    {nodes.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400">Agent non modifiable</p>
                      ) : (
                        <div className="scrollable-nodes">
                          <ul className="space-y-3">
                            {nodes.map(node => (
                              <li key={node.id} className="node-card flex items-center justify-between p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center space-x-3">
                                  <span className="text-xl text-blue-500">{getNodeIcon(node.name)}</span>
                                  <span className={`text-gray-700 dark:text-gray-200 ${node.disabled ? 'text-gray-400 dark:text-gray-500' : ''}`}>
                                    {node.name.replace(/\*/g, '').trim()}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-3">
                                  <label className="node-toggle-container">
                                    <input
                                      type="checkbox"
                                      className="node-toggle-checkbox"
                                      checked={!node.disabled}
                                      onChange={() => handleToggleNode(node.id)}
                                    />
                                    <span className="node-toggle-label"></span>
                                  </label>
                                  <button
                                    onClick={() => handleRemoveNode(node.id)}
                                    className="text-red-500 hover:text-red-700 text-lg font-bold"
                                    title="Remove Node"
                                  >
                                    ×
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Performance</h3>
                    {chartData.length === 0 ? (
                      <p className="text-gray-500 dark:text-gray-400">No data </p>
                    ) : (
                      <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg shadow-inner">
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart
                            data={chartData}
                            margin={{
                              top: 20, right: 30, left: 20, bottom: 5,
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" className="dark:stroke-gray-600" />
                            <XAxis dataKey="date" stroke="#333" className="dark:stroke-gray-300" />
                            <YAxis stroke="#333" className="dark:stroke-gray-300" />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px', padding: '10px' }}
                              labelStyle={{ color: '#333', fontWeight: 'bold' }}
                              itemStyle={{ color: '#555' }}
                            />
                            <Bar dataKey="successful" stackId="a" fill="#4CAF50" name="Successful" />
                            <Bar dataKey="other" stackId="a" fill="#9E9E9E" name="Other Status" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Taux Données récupérées</h3>
                    {lineChartData.length === 0 ? (
                      <p className="text-gray-500 dark:text-gray-400">No data </p>
                    ) : (
                      <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg shadow-inner">
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart
                            data={lineChartData}
                            margin={{
                              top: 20, right: 30, left: 20, bottom: 5,
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" className="dark:stroke-gray-600" />
                            <XAxis dataKey="date" stroke="#333" className="dark:stroke-gray-300" />
                            <YAxis stroke="#333" className="dark:stroke-gray-300" />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px', padding: '10px' }}
                              labelStyle={{ color: '#333', fontWeight: 'bold' }}
                              itemStyle={{ color: '#555' }}
                            />
                            <Line type="monotone" dataKey="count" stroke="#8884d8" activeDot={{ r: 8 }} name="Output Entries" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Securité</h3>
                    <button onClick={handleGenerateAudit} className="btn btn-primary">Génerer Rapport</button>
                    {auditChartData.length === 0 && audit ? (
                      <p className="text-gray-500 dark:text-gray-400">No risks</p>
                    ) : auditChartData.length === 0 && !audit ? (
                      <p className="text-gray-500 dark:text-gray-400"></p>
                    ) : (
                      <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg shadow-inner flex flex-col items-center">
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={auditChartData}
                              cx="50%"
                              cy="50%"
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                              labelLine={false}
                              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                              onClick={onPieClick}
                            >
                              {auditChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px', padding: '10px' }}
                              labelStyle={{ color: '#333', fontWeight: 'bold' }}
                              itemStyle={{ color: '#555' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        {selectedWorkflowId && (
          <>
            <section className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 space-y-6">
              <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-gray-100">
                Données - {workflowData?.name ? `(${workflowData.name})` : '(Selected Workflow)'}
              </h2>
              {latestWorkflowRealtimeData ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Execution ID: {latestWorkflowRealtimeData.executionId || 'N/A'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Status: {latestWorkflowRealtimeData.status || 'N/A'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Finished: {typeof latestWorkflowRealtimeData.finished === 'boolean' ? (latestWorkflowRealtimeData.finished ? 'Yes' : 'No') : 'N/A'}
                  </p>
                  
                  <h3 className="text-lg font-semibold mt-3 text-gray-700 dark:text-gray-300">Input:</h3>
                  <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-auto text-sm text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">
                    {typeof latestWorkflowRealtimeData.input === 'string'
                      ? latestWorkflowRealtimeData.input
                      : JSON.stringify(latestWorkflowRealtimeData.input, null, 2)
                    }
                  </pre>

                  {latestWorkflowRealtimeData.output && typeof latestWorkflowRealtimeData.output === 'object' && Object.keys(latestWorkflowRealtimeData.output).length > 0 ? (
                    <div className="mt-4">
                      <h3 className="text-lg font-semibold mt-3 text-gray-700 dark:text-gray-300">Output Data:</h3>
                      <div className="overflow-x-auto rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
                        <table className="min-w-full bg-white dark:bg-gray-800">
                          <thead className="bg-gray-200 dark:bg-gray-700">
                            <tr>
                              {getDynamicTableHeaders(latestWorkflowRealtimeData.output).map(header => (
                                <th key={header} className="py-2 px-4 text-left text-xs font-medium text-gray-800 dark:text-gray-100 uppercase tracking-wider border-b border-gray-300 dark:border-gray-600">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                            <tr>
                              {getDynamicTableHeaders(latestWorkflowRealtimeData.output).map(header => (
                                <td key={header} className="py-2 px-4 text-sm text-gray-900 dark:text-gray-100 align-top">
                                  {renderDynamicCellContent(latestWorkflowRealtimeData.output[header])}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <h3 className="text-lg font-semibold mt-3 text-gray-700 dark:text-gray-300">Output:</h3>
                      <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-auto text-sm text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">
                        {typeof latestWorkflowRealtimeData.output === 'string'
                          ? latestWorkflowRealtimeData.output
                          : JSON.stringify(latestWorkflowRealtimeData.output, null, 2)
                        }
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-600 dark:text-gray-400">
                  Waiting ...
                </p>
              )}
            </section>

            <section className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 space-y-6">
                <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-gray-100">
                    Histoire Des Données
                </h2>
                {mongoOutputData.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400">No data</p>
                ) : (
                    <div className="overflow-x-auto overflow-y-auto max-h-96 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
                        <table className="min-w-full bg-white dark:bg-gray-800">
                            <thead className="bg-gray-200 dark:bg-gray-700">
                                <tr>
                                    {allMongoOutputHeaders.map(header => (
                                        <th key={header} className="py-2 px-4 text-left text-xs font-medium text-gray-800 dark:text-gray-100 uppercase tracking-wider border-b border-gray-300 dark:border-gray-600">
                                            {header === 'timestamp' ? 'Timestamp' : (header === 'executionId' ? 'Execution ID' : header)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                                {mongoOutputData.map((dataEntry, index) => (
                                    <tr key={dataEntry.executionId || index}>
                                        {allMongoOutputHeaders.map(header => (
                                            <td key={`${dataEntry.executionId || index}-${header}`} className="py-2 px-4 text-sm text-gray-900 dark:text-gray-100 align-top">
                                                {header === 'timestamp' 
                                                    ? (dataEntry.timestamp ? new Date(dataEntry.timestamp).toLocaleString() : 'N/A')
                                                    : header === 'executionId'
                                                    ? (dataEntry.executionId || 'N/A')
                                                    : renderDynamicCellContent(dataEntry.output ? dataEntry.output[header] : undefined)
                                                }
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
          </>
        )}
      </main>
      <AuditDetailModal
        show={showAuditDetailModal}
        title="Workflow Audit Details"
        details={selectedWorkflowAuditDetails}
        onClose={() => setShowAuditDetailModal(false)}
      />
    </>
  );
}
