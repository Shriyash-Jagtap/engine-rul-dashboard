'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Cog, Activity, AlertTriangle, Zap, TrendingDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface SensorData {
  engine_id: number;
  cycle: number;
  op_setting_1: number;
  op_setting_2: number;
  op_setting_3: number;
  sensor_1: number;
  sensor_2: number;
  sensor_3: number;
  sensor_4: number;
  sensor_5: number;
  sensor_6: number;
  sensor_7: number;
  sensor_8: number;
  sensor_9: number;
  sensor_10: number;
  sensor_11: number;
  sensor_12: number;
  sensor_13: number;
  sensor_14: number;
  sensor_15: number;
  sensor_16: number;
  sensor_17: number;
  sensor_18: number;
  sensor_19: number;
  sensor_20: number;
  sensor_21: number;
}

interface PredictionResult {
  rul_prediction: number;
  confidence: number;
  anomaly_detected: boolean;
  timestamp: string;
}

interface HistoryPoint {
  cycle: number;
  rul: number;
  confidence: number;
  anomaly: boolean;
  timestamp: string;
}

export default function Home() {
  const [sensorData, setSensorData] = useState<SensorData[]>([]);
  const [currentPrediction, setCurrentPrediction] = useState<PredictionResult | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentCycle, setCurrentCycle] = useState(1);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [selectedDataType, setSelectedDataType] = useState<'normal' | 'anomaly' | 'degraded' | 'healthy'>('normal');
  const [streamingSpeed, setStreamingSpeed] = useState(2000);
  const [manualPredictionMode, setManualPredictionMode] = useState(false);
  const [manualSensorValues, setManualSensorValues] = useState<Partial<SensorData>>({});
  const [sensorStatus, setSensorStatus] = useState<any>(null);

  const simulateRealTimeData = async () => {
    try {
      setConnectionStatus('connecting');
      const response = await fetch(`http://localhost:8000/simulate-stream?data_type=${selectedDataType}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const newData: SensorData = await response.json();
      newData.cycle = currentCycle;
      
      const updatedData = [...sensorData, newData].slice(-30); // Keep last 30 points
      setSensorData(updatedData);
      setCurrentCycle(prev => prev + 1);
      setConnectionStatus('connected');

      // Fetch sensor status
      const statusResponse = await fetch(`http://localhost:8000/sensor-status?data_type=${selectedDataType}`);
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        setSensorStatus(status);
      }

      // Make prediction if we have enough data (minimum 10 days)
      console.log(`Checking prediction: ${updatedData.length} data points available`);
      if (updatedData.length >= 10) {
        console.log('Making prediction with', updatedData.length, 'data points');
        const predResponse = await fetch('http://localhost:8000/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sensor_data: updatedData }),
        });
        
        if (predResponse.ok) {
          const prediction: PredictionResult = await predResponse.json();
          console.log('Prediction received:', prediction);
          setCurrentPrediction(prediction);
          
          // Add to history
          const historyPoint: HistoryPoint = {
            cycle: currentCycle,
            rul: prediction.rul_prediction,
            confidence: prediction.confidence,
            anomaly: prediction.anomaly_detected,
            timestamp: prediction.timestamp,
          };
          
          setHistory(prev => [...prev, historyPoint].slice(-50)); // Keep last 50 predictions
        } else {
          const errorText = await predResponse.text();
          console.error('Prediction failed:', predResponse.status, errorText);
        }
      } else {
        console.log('Not enough data for prediction yet:', updatedData.length, 'need 10');
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      console.error('Make sure the backend is running on http://localhost:8000');
      setConnectionStatus('disconnected');
      // Stop streaming on error
      setIsStreaming(false);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isStreaming) {
      interval = setInterval(simulateRealTimeData, streamingSpeed);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isStreaming, sensorData, currentCycle, streamingSpeed, selectedDataType]);

  const checkConnection = async () => {
    try {
      const response = await fetch('http://localhost:8000/health');
      if (response.ok) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('disconnected');
      }
    } catch (error) {
      setConnectionStatus('disconnected');
    }
  };

  const toggleStreaming = () => {
    setIsStreaming(!isStreaming);
  };

  // Check connection on component mount
  useEffect(() => {
    checkConnection();
  }, []);

  // Initialize data when connection is established
  useEffect(() => {
    const initializeData = async () => {
      if (connectionStatus === 'connected' && sensorData.length === 0) {
        try {
          // Generate initial 10 data points (minimum for prediction)
          const initialData = [];
          for (let i = 0; i < 10; i++) {
            const response = await fetch(`http://localhost:8000/simulate-stream?data_type=${selectedDataType}`);
            if (response.ok) {
              const data = await response.json();
              data.cycle = i + 1;
              initialData.push(data);
            }
          }
          if (initialData.length === 10) {
            setSensorData(initialData);
            setCurrentCycle(11);
            
            // Get sensor status
            const statusResponse = await fetch(`http://localhost:8000/sensor-status?data_type=${selectedDataType}`);
            if (statusResponse.ok) {
              const status = await statusResponse.json();
              setSensorStatus(status);
            }
          }
        } catch (error) {
          console.error('Failed to initialize data:', error);
        }
      }
    };
    
    initializeData();
  }, [connectionStatus, selectedDataType]);

  // Make initial prediction when data is loaded
  useEffect(() => {
    if (sensorData.length >= 10 && !currentPrediction) {
      makeSinglePrediction();
    }
  }, [sensorData.length]);

  const makeSinglePrediction = async () => {
    if (sensorData.length < 10) {
      alert('Need at least 10 data points for prediction. Start streaming first or upload data.');
      return;
    }

    try {
      const predResponse = await fetch('http://localhost:8000/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensor_data: sensorData.slice(-30) }),
      });
      
      if (predResponse.ok) {
        const prediction: PredictionResult = await predResponse.json();
        setCurrentPrediction(prediction);
        
        const historyPoint: HistoryPoint = {
          cycle: currentCycle,
          rul: prediction.rul_prediction,
          confidence: prediction.confidence,
          anomaly: prediction.anomaly_detected,
          timestamp: prediction.timestamp,
        };
        
        setHistory(prev => [...prev, historyPoint].slice(-50));
      }
    } catch (error) {
      console.error('Prediction failed:', error);
    }
  };

  const getHealthStatus = () => {
    if (!currentPrediction) return { status: 'unknown', color: 'gray' };
    
    const rul = currentPrediction.rul_prediction;
    const anomaly = currentPrediction.anomaly_detected;
    
    // If anomaly detected, always show critical or warning
    if (anomaly) {
      if (rul < 50) return { status: 'critical', color: 'red' };
      return { status: 'warning', color: 'yellow' };
    }
    
    // Normal status based on RUL thresholds
    if (rul > 100) return { status: 'healthy', color: 'green' };
    if (rul > 60) return { status: 'good', color: 'blue' };
    if (rul > 30) return { status: 'warning', color: 'yellow' };
    return { status: 'critical', color: 'red' };
  };

  const health = getHealthStatus();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-white flex items-center justify-center gap-3">
            <Cog className="w-10 h-10" />
            Engine RUL Prediction Dashboard
          </h1>
          <p className="text-gray-300">Real-time monitoring and remaining useful life prediction</p>
        </div>

        {/* Control Panel */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Control Panel</h2>
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className={`w-3 h-3 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-400' :
                connectionStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'
              }`}></div>
              <span className="text-gray-300 text-sm">
                Backend: {connectionStatus === 'connected' ? 'Connected' : 
                         connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
              </span>
            </div>
          </div>

          {/* Data Type Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-white font-medium">Data Type:</label>
              <select 
                value={selectedDataType} 
                onChange={(e) => setSelectedDataType(e.target.value as any)}
                className="w-full p-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="normal">Normal Operation</option>
                <option value="healthy">Healthy Engine</option>
                <option value="degraded">Degraded Engine</option>
                <option value="anomaly">Anomaly Conditions</option>
              </select>
              <p className="text-xs text-gray-400">
                {selectedDataType === 'normal' && 'Gradual wear over 100 days'}
                {selectedDataType === 'healthy' && 'Healthy for 100 days, high RUL'}
                {selectedDataType === 'degraded' && 'Healthy till day 40, then degrades'}
                {selectedDataType === 'anomaly' && 'Spikes start day 30, worsen over time'}
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-white font-medium">Streaming Speed:</label>
              <select 
                value={streamingSpeed} 
                onChange={(e) => setStreamingSpeed(Number(e.target.value))}
                className="w-full p-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value={500}>Very Fast (0.5s)</option>
                <option value={1000}>Fast (1s)</option>
                <option value={2000}>Normal (2s)</option>
                <option value={5000}>Slow (5s)</option>
              </select>
              <p className="text-xs text-gray-400">Update frequency for streaming data</p>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex flex-wrap justify-center gap-4">
            <Button
              onClick={toggleStreaming}
              disabled={connectionStatus === 'disconnected'}
              className={`${isStreaming ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white px-6 py-2 disabled:opacity-50`}
            >
              {isStreaming ? 'Stop Streaming' : 'Start Streaming'}
              <Activity className="ml-2 w-4 h-4" />
            </Button>

            <Button
              onClick={makeSinglePrediction}
              disabled={connectionStatus === 'disconnected' || sensorData.length < 10}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 disabled:opacity-50"
            >
              Single Prediction
              <Zap className="ml-2 w-4 h-4" />
            </Button>

            <Button
              onClick={() => {
                setSensorData([]);
                setHistory([]);
                setCurrentPrediction(null);
                setCurrentCycle(1);
              }}
              className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2"
            >
              Clear Data
              <AlertTriangle className="ml-2 w-4 h-4" />
            </Button>

            <Button
              onClick={async () => {
                try {
                  await fetch('http://localhost:8000/reset-stream');
                  setSensorData([]);
                  setHistory([]);
                  setCurrentPrediction(null);
                  setCurrentCycle(1);
                } catch (error) {
                  console.error('Failed to reset stream:', error);
                }
              }}
              disabled={connectionStatus === 'disconnected'}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 disabled:opacity-50"
            >
              Reset Timeline
              <TrendingDown className="ml-2 w-4 h-4" />
            </Button>
          </div>

          {connectionStatus === 'disconnected' && (
            <p className="text-red-400 text-sm text-center">Make sure backend is running on http://localhost:8000</p>
          )}
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Current RUL</CardTitle>
              <TrendingDown className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {currentPrediction ? `${currentPrediction.rul_prediction.toFixed(1)} cycles` : 'N/A'}
              </div>
              <p className="text-xs text-gray-400">
                {currentPrediction ? `${(currentPrediction.confidence * 100).toFixed(1)}% confidence` : 'No prediction yet'}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Engine Status</CardTitle>
              <Cog className={`h-4 w-4 text-${health.color}-400`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold text-${health.color}-400 capitalize`}>
                {health.status}
              </div>
              <p className="text-xs text-gray-400">Current cycle: {currentCycle}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Data Points</CardTitle>
              <Activity className="h-4 w-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{sensorData.length}</div>
              <p className="text-xs text-gray-400">
                Day: {sensorData.length > 0 ? sensorData[sensorData.length - 1]?.cycle || currentCycle : 'N/A'} | Type: {selectedDataType}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Anomalies</CardTitle>
              <AlertTriangle className={`h-4 w-4 ${currentPrediction?.anomaly_detected ? 'text-red-400' : 'text-green-400'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${currentPrediction?.anomaly_detected ? 'text-red-400' : 'text-green-400'}`}>
                {currentPrediction?.anomaly_detected ? 'DETECTED' : 'NONE'}
              </div>
              <p className="text-xs text-gray-400">Current status</p>
            </CardContent>
          </Card>
        </div>

        {/* Anomaly Alert */}
        {currentPrediction?.anomaly_detected && (
          <Alert className="bg-red-900/20 border-red-700">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-300">
              Anomaly detected! Sensor values indicate potential sudden failure risk.
            </AlertDescription>
          </Alert>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* RUL Trend */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">RUL Trend Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="cycle" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1F2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#F9FAFB'
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="rul" 
                    stroke="#8B5CF6" 
                    fill="#8B5CF6" 
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Key Sensor Values */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Key Sensor Readings</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={sensorData.slice(-10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="cycle" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1F2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#F9FAFB'
                    }} 
                  />
                  <Line type="monotone" dataKey="sensor_2" stroke="#EF4444" name="Temperature 1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sensor_3" stroke="#F59E0B" name="Temperature 2" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sensor_7" stroke="#10B981" name="Pressure" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sensor_11" stroke="#3B82F6" name="Pressure 2" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Real-time Sensor Grid */}
        {sensorData.length > 0 && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                Current Sensor Readings
                {sensorStatus && (
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    sensorStatus.overall_status === 'good' ? 'bg-green-600 text-white' :
                    sensorStatus.overall_status === 'normal' ? 'bg-blue-600 text-white' :
                    sensorStatus.overall_status === 'bad' ? 'bg-yellow-600 text-black' :
                    'bg-red-600 text-white'
                  }`}>
                    {sensorStatus.overall_status.toUpperCase()}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {Object.entries(sensorData[sensorData.length - 1] || {})
                  .filter(([key]) => key.startsWith('sensor_'))
                  .slice(0, 21)
                  .map(([key, value]) => {
                    const sensorConfig = sensorStatus?.sensor_configs?.[key];
                    const sensorName = sensorConfig?.name || key.replace('_', ' ');
                    const unit = sensorConfig?.unit || '';
                    
                    // Determine sensor health based on data type
                    const getHealthColor = () => {
                      if (!sensorStatus) return 'border-gray-600';
                      switch (sensorStatus.overall_status) {
                        case 'good': return 'border-green-500';
                        case 'normal': return 'border-blue-500'; 
                        case 'bad': return 'border-yellow-500';
                        case 'faulty': return 'border-red-500';
                        default: return 'border-gray-600';
                      }
                    };
                    
                    return (
                      <div 
                        key={key} 
                        className={`bg-slate-700/50 p-3 rounded-lg text-center border-l-4 ${getHealthColor()}`}
                      >
                        <div className="text-xs text-gray-400 font-medium mb-1">
                          {sensorName}
                        </div>
                        <div className="text-white font-bold text-sm">
                          {Number(value).toFixed(1)}
                        </div>
                        {unit && (
                          <div className="text-xs text-gray-500">{unit}</div>
                        )}
                      </div>
                    );
                  })}
              </div>
              
              {/* Health Legend */}
              <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 border-l-4 border-green-500"></div>
                  <span className="text-gray-400">Good</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 border-l-4 border-blue-500"></div>
                  <span className="text-gray-400">Normal</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 border-l-4 border-yellow-500"></div>
                  <span className="text-gray-400">Bad</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 border-l-4 border-red-500"></div>
                  <span className="text-gray-400">Faulty</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
