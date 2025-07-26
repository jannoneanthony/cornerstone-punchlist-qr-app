/* global __app_id, __firebase_config, __initial_auth_token */
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection } from 'firebase/firestore';

// Ensure these global variables are defined by the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Utility for a simple message box instead of alert()
const showMessage = (message, type = 'info') => {
    const messageBox = document.getElementById('message-box');
    if (messageBox) {
        messageBox.textContent = message;
        messageBox.className = `fixed bottom-4 right-4 p-4 rounded-lg shadow-lg text-white ${type === 'error' ? 'bg-red-600' : 'bg-blue-600'} z-50`;
        messageBox.style.display = 'block';
        setTimeout(() => {
            messageBox.style.display = 'none';
        }, 3000);
    }
};

const App = () => {
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [currentPage, setCurrentPage] = useState('home'); // 'home' or 'unitView'
    const [selectedUnitId, setSelectedUnitId] = useState(null);
    const [units, setUnits] = useState([]);

    // Initialize Firebase and set up authentication
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const authentication = getAuth(app);

            setDb(firestore);

            const unsubscribe = onAuthStateChanged(authentication, async (user) => {
                if (user) {
                    setUserId(user.uid);
                    setIsAuthReady(true);
                    console.log("Firebase Auth Ready. User ID:", user.uid);
                } else {
                    console.log("No user signed in. Attempting anonymous sign-in...");
                    try {
                        if (initialAuthToken) {
                            await signInWithCustomToken(authentication, initialAuthToken);
                            console.log("Signed in with custom token.");
                        } else {
                            await signInAnonymously(authentication);
                            console.log("Signed in anonymously.");
                        }
                    } catch (error) {
                        console.error("Firebase authentication error:", error);
                        showMessage(`Authentication failed: ${error.message}`, 'error');
                    }
                }
            });

            // Clean up the auth listener on component unmount
            return () => unsubscribe();
        } catch (error) {
            console.error("Failed to initialize Firebase:", error);
            showMessage(`Firebase initialization failed: ${error.message}`, 'error');
        }
    }, []);

    // Fetch units when auth is ready
    useEffect(() => {
        if (isAuthReady && db && userId) {
            const unitsCollectionRef = collection(db, `/artifacts/${appId}/public/data/units`);
            const unsubscribe = onSnapshot(unitsCollectionRef, (snapshot) => {
                const fetchedUnits = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setUnits(fetchedUnits);
                console.log("Units fetched:", fetchedUnits);
            }, (error) => {
                console.error("Error fetching units:", error);
                showMessage(`Error fetching units: ${error.message}`, 'error');
            });

            // Parse URL for unitId if navigating directly
            const urlParams = new URLSearchParams(window.location.search);
            const unitIdParam = urlParams.get('unitId');
            if (unitIdParam) {
                setSelectedUnitId(unitIdParam);
                setCurrentPage('unitView');
            }

            return () => unsubscribe();
        }
    }, [isAuthReady, userId]); // Removed 'db' from dependencies

    const handleUnitClick = (unitId) => {
        setSelectedUnitId(unitId);
        setCurrentPage('unitView');
        // Removed window.history.pushState to avoid SecurityError in blob: URLs
        // window.history.pushState({}, '', `?unitId=${unitId}`);
    };

    const handleBackToHome = () => {
        setCurrentPage('home');
        setSelectedUnitId(null);
        // Removed window.history.pushState to avoid SecurityError in blob: URLs
        // window.history.pushState({}, '', window.location.pathname); // Clean URL
    };

    // Home Page Component
    const HomePage = () => {
        const [showAddUnitModal, setShowAddUnitModal] = useState(false);
        const [newUnitName, setNewUnitName] = useState('');
        const [newUnitAddress, setNewUnitAddress] = useState('');

        const defaultTrades = {
            Electrical: [
                { task: "Rough-in wiring", completed: false },
                { task: "Fixture installation", completed: false }
            ],
            Plumbing: [
                { task: "Rough-in pipes", completed: false },
                { task: "Fixture hookup", completed: false }
            ],
            Drywall: [
                { task: "Hang sheets", completed: false },
                { task: "Tape and mud", completed: false }
            ],
            Painting: [
                { task: "Prime walls", completed: false },
                { task: "Apply finish coats", completed: false }
            ],
            Flooring: [
                { task: "Install subfloor", completed: false },
                { task: "Lay finish flooring", completed: false }
            ]
        };

        const addUnitToFirestore = async (unitName, unitAddress) => {
            if (!db || !userId) {
                showMessage("Firebase not initialized. Please wait.", "error");
                return false;
            }
            try {
                const unitRef = doc(db, `/artifacts/${appId}/public/data/units`, unitName);
                await setDoc(unitRef, {
                    address: unitAddress,
                    status: 'Not Started',
                    trades: defaultTrades
                });
                showMessage(`Unit "${unitName}" added successfully!`);
                return true;
            } catch (error) {
                console.error("Error adding unit:", error);
                showMessage(`Error adding unit: ${error.message}`, 'error');
                return false;
            }
        };

        const handleOpenAddUnitModal = () => {
            setNewUnitName('');
            setNewUnitAddress('');
            setShowAddUnitModal(true);
        };

        const handleCloseAddUnitModal = () => {
            setShowAddUnitModal(false);
        };
        const handleConfirmAddUnit = async () => {
            if (newUnitName.trim() === '' || newUnitAddress.trim() === '') {
                showMessage("Unit name and address cannot be empty.", "error");
                return;
            }
            const success = await addUnitToFirestore(newUnitName, newUnitAddress);
            if (success) {
                handleCloseAddUnitModal();
            }
        };

        const handleGenerateMultipleUnits = async () => {
            if (!db || !userId) {
                showMessage("Firebase not initialized. Please wait.", "error");
                return;
            }

            const confirmGenerate = window.confirm("This will add 80 new units (4 buildings x 20 units). Are you sure?");
            if (!confirmGenerate) {
                return;
            }

            showMessage("Generating units, please wait...", "info");
            const buildingPrefixes = ['BuildingA', 'BuildingB', 'BuildingC', 'BuildingD'];
            let unitsAddedCount = 0;

            for (const building of buildingPrefixes) {
                for (let i = 1; i <= 20; i++) {
                    const unitNumber = i < 10 ? `0${i}` : `${i}`; // Format as 01, 02, etc.
                    const unitName = `${building}-Unit${unitNumber}`;
                    const unitAddress = `${building} Address, Unit ${unitNumber}`;
                    const success = await addUnitToFirestore(unitName, unitAddress);
                    if (success) {
                        unitsAddedCount++;
                    } else {
                        showMessage(`Failed to add unit ${unitName}. Stopping batch generation.`, 'error');
                        return; // Stop if any unit fails
                    }
                }
            }
            showMessage(`Successfully added ${unitsAddedCount} units!`);
        };

        const handleGenerateQRLink = (unitId) => {
            // IMPORTANT: For real QR codes, once deployed, window.location.origin will correctly be your domain.
            // For example, if your app is deployed to https://cornerstonepunchlistqr.com,
            // then window.location.origin will be "https://cornerstonepunchlistqr.com".
            const qrLink = `${window.location.origin}${window.location.pathname}?unitId=${unitId}`;

            showMessage(`QR Code Link for ${unitId}: ${qrLink}. Copy this link and use an online QR code generator.`, 'info');
            console.log(`QR Code Link for ${unitId}:`, qrLink);
        };

        if (!isAuthReady) {
            return (
                <div className="flex justify-center items-center h-screen bg-gray-100">
                    <div className="text-xl text-gray-700">Loading application...</div>
                </div>
            );
        }

        return (
            <div className="p-6 max-w-4xl mx-auto bg-white rounded-lg shadow-xl mt-10 font-sans">
                <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">Construction Project Tracker</h1>
                <p className="text-center text-gray-600 mb-8">
                    User ID: <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{userId}</span>
                </p>

                <div className="flex justify-center flex-wrap gap-4 mb-8">
                    <button
                        onClick={handleOpenAddUnitModal}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                    >
                        Add Single Unit
                    </button>
                    <button
                        onClick={handleGenerateMultipleUnits}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                    >
                        Generate 4 Buildings (80 Units)
                    </button>
                </div>

                {units.length === 0 ? (
                    <p className="text-center text-gray-500 text-lg">No units found. Add units to get started!</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {units.map((unit) => (
                            <div key={unit.id} className="bg-blue-50 border border-blue-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                                <h2 className="text-xl font-semibold text-blue-800 mb-2">{unit.id}</h2>
                                <p className="text-gray-700 mb-3">{unit.address}</p>
                                <p className="text-sm text-gray-600 mb-4">Status: <span className="font-medium text-blue-700">{unit.status}</span></p>
                                <div className="flex flex-col space-y-2">
                                    <button
                                        onClick={() => handleUnitClick(unit.id)}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out transform hover:scale-105"
                                    >
                                        View Details
                                    </button>
                                    <button
                                        onClick={() => handleGenerateQRLink(unit.id)}
                                        className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out transform hover:scale-105"
                                    >
                                        Generate QR Link
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add Unit Modal */}
                {showAddUnitModal && (
                    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
                        <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
                            <h2 className="text-2xl font-bold mb-6 text-gray-800">Add New Unit</h2>
                            <div className="mb-4">
                                <label htmlFor="unit-name" className="block text-gray-700 text-sm font-bold mb-2">Unit Name (e.g., BuildingA-Unit101):</label>
                                <input
                                    type="text"
                                    id="unit-name"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={newUnitName}
                                    onChange={(e) => setNewUnitName(e.target.value)}
                                    placeholder="Enter unit name"
                                />
                            </div>
                            <div className="mb-6">
                                <label htmlFor="unit-address" className="block text-gray-700 text-sm font-bold mb-2">Unit Address:</label>
                                <input
                                    type="text"
                                    id="unit-address"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={newUnitAddress}
                                    onChange={(e) => setNewUnitAddress(e.target.value)}
                                    placeholder="Enter unit address"
                                />
                            </div>
                            <div className="flex justify-end gap-4">
                                <button
                                    onClick={handleCloseAddUnitModal}
                                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmAddUnit}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out"
                                >
                                    Add Unit
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Unit View Component
    const UnitView = ({ unitId, onBack }) => {
        const [unitData, setUnitData] = useState(null);
        const [selectedTrade, setSelectedTrade] = useState('');
        const [loading, setLoading] = useState(true);
        const [isGeneratingTasks, setIsGeneratingTasks] = useState(false); // New state for LLM loading

        useEffect(() => {
            if (!db || !unitId) return;

            setLoading(true);
            const unitDocRef = doc(db, `/artifacts/${appId}/public/data/units`, unitId);
            const unsubscribe = onSnapshot(unitDocRef, (docSnap) => {
                if (docSnap.exists()) {
                    setUnitData(docSnap.data());
                    // Set the first trade as selected by default if not already set
                    if (!selectedTrade && docSnap.data().trades) {
                        const firstTrade = Object.keys(docSnap.data().trades)[0];
                        if (firstTrade) {
                            setSelectedTrade(firstTrade);
                        }
                    }
                    console.log("Unit data updated:", docSnap.data());
                } else {
                    console.log("No such unit document!");
                    setUnitData(null);
                    showMessage(`Unit "${unitId}" not found.`, 'error');
                }
                setLoading(false);
            }, (error) => {
                console.error("Error fetching unit data:", error);
                showMessage(`Error fetching unit data: ${error.message}`, 'error');
                setLoading(false);
            });

            return () => unsubscribe();
        }, [db, unitId, selectedTrade]); // Added selectedTrade to dependencies to re-evaluate first trade selection

        const handleTaskToggle = async (tradeName, taskIndex) => {
            if (!unitData || !db) return;

            const updatedTrades = { ...unitData.trades };
            const tasks = [...updatedTrades[tradeName]];
            tasks[taskIndex].completed = !tasks[taskIndex].completed;
            updatedTrades[tradeName] = tasks;

            try {
                const unitDocRef = doc(db, `/artifacts/${appId}/public/data/units`, unitId);
                await updateDoc(unitDocRef, { trades: updatedTrades });
                showMessage(`Task updated for ${tradeName}!`);
            } catch (error) {
                console.error("Error updating task:", error);
                showMessage(`Error updating task: ${error.message}`, 'error');
            }
        };

        const handleAddTask = async () => {
            if (!unitData || !db || !selectedTrade) {
                showMessage("Please select a trade first.", "error");
                return;
            }

            const newTaskName = window.prompt(`Enter new task for ${selectedTrade}:`); // Using window.prompt for simplicity here
            if (newTaskName) {
                const updatedTrades = { ...unitData.trades };
                const tasks = updatedTrades[selectedTrade] ? [...updatedTrades[selectedTrade]] : [];
                tasks.push({ task: newTaskName, completed: false });
                updatedTrades[selectedTrade] = tasks;

                try {
                    const unitDocRef = doc(db, `/artifacts/${appId}/public/data/units`, unitId);
                    await updateDoc(unitDocRef, { trades: updatedTrades });
                    showMessage(`Task "${newTaskName}" added to ${selectedTrade}!`);
                } catch (error) {
                    console.error("Error adding task:", error);
                    showMessage(`Error adding task: ${error.message}`, 'error');
                }
            }
        };

        const handleSuggestTasks = async () => {
            if (!db || !selectedTrade || !unitData) {
                showMessage("Please select a trade and ensure unit data is loaded.", "error");
                return;
            }

            setIsGeneratingTasks(true);
            showMessage(`Generating tasks for ${selectedTrade}...`, 'info');

            try {
                const prompt = `Generate a JSON array of 5 common tasks (strings) for "${selectedTrade}" in a residential construction project. Do not include any introductory or concluding remarks, just the JSON array. Example: ["Task 1", "Task 2"]`;
                let chatHistory = [];
                chatHistory.push({ role: "user", parts: [{ text: prompt }] });

                const payload = {
                    contents: chatHistory,
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "ARRAY",
                            items: { "type": "STRING" }
                        }
                    }
                };

                const apiKey = ""; // Canvas will provide this
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (result.candidates && result.candidates.length > 0 &&
                    result.candidates[0].content && result.candidates[0].content.parts &&
                    result.candidates[0].content.parts.length > 0) {
                    const jsonString = result.candidates[0].content.parts[0].text;
                    const suggestedTasks = JSON.parse(jsonString);

                    if (Array.isArray(suggestedTasks) && suggestedTasks.length > 0) {
                        const updatedTrades = { ...unitData.trades };
                        const existingTasks = updatedTrades[selectedTrade] ? [...updatedTrades[selectedTrade]] : [];

                        // Filter out duplicates and add new tasks
                        const newTasksToAdd = suggestedTasks
                            .filter(suggestedTask => !existingTasks.some(existing => existing.task === suggestedTask))
                            .map(task => ({ task: task, completed: false }));

                        if (newTasksToAdd.length > 0) {
                            updatedTrades[selectedTrade] = [...existingTasks, ...newTasksToAdd];

                            const unitDocRef = doc(db, `/artifacts/${appId}/public/data/units`, unitId);
                            await updateDoc(unitDocRef, { trades: updatedTrades });
                            showMessage(`Suggested tasks added for ${selectedTrade}!`);
                        } else {
                            showMessage("No new unique tasks were suggested.", "info");
                        }
                    } else {
                        showMessage("Gemini did not return a valid list of tasks.", "error");
                        console.error("Gemini response was not a valid array:", suggestedTasks);
                    }
                } else {
                    showMessage("Failed to get task suggestions from Gemini. Please try again.", "error");
                    console.error("Gemini response structure unexpected:", result);
                }
            } catch (error) {
                console.error("Error calling Gemini API:", error);
                showMessage(`Error suggesting tasks: ${error.message}`, 'error');
            } finally {
                setIsGeneratingTasks(false);
            }
        };


        if (loading) {
            return (
                <div className="flex justify-center items-center h-screen bg-gray-100">
                    <div className="text-xl text-gray-700">Loading unit data...</div>
                </div>
            );
        }

        if (!unitData) {
            return (
                <div className="p-6 max-w-4xl mx-auto bg-white rounded-lg shadow-xl mt-10 font-sans">
                    <button
                        onClick={onBack}
                        className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg mb-4 transition duration-300 ease-in-out"
                    >
                        &larr; Back to Units
                    </button>
                    <p className="text-center text-red-500 text-lg">Unit data not available.</p>
                </div>
            );
        }

        const trades = unitData.trades ? Object.keys(unitData.trades) : [];
        const currentTasks = selectedTrade && unitData.trades[selectedTrade] ? unitData.trades[selectedTrade] : [];

        return (
            <div className="p-6 max-w-4xl mx-auto bg-white rounded-lg shadow-xl mt-10 font-sans">
                <button
                    onClick={onBack}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg mb-4 transition duration-300 ease-in-out"
                >
                    &larr; Back to Units
                </button>
                <h1 className="text-3xl font-bold mb-4 text-center text-gray-800">Unit: {unitId}</h1>
                <p className="text-center text-gray-600 mb-6">Address: {unitData.address}</p>
                <p className="text-center text-gray-600 mb-6">Overall Status: <span className="font-semibold text-green-700">{unitData.status}</span></p>

                <div className="mb-6">
                    <label htmlFor="trade-select" className="block text-lg font-medium text-gray-700 mb-2">Select Trade:</label>
                    <select
                        id="trade-select"
                        value={selectedTrade}
                        onChange={(e) => setSelectedTrade(e.target.value)}
                        className="block w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base"
                    >
                        <option value="">-- Choose a Trade --</option>
                        {trades.map((trade) => (
                            <option key={trade} value={trade}>{trade}</option>
                        ))}
                    </select>
                </div>

                {selectedTrade ? (
                    <div>
                        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Tasks for {selectedTrade}</h2>
                        <div className="flex flex-wrap gap-4 mb-4">
                            <button
                                onClick={handleAddTask}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                            >
                                Add New Task
                            </button>
                            <button
                                onClick={handleSuggestTasks}
                                disabled={isGeneratingTasks}
                                className={`font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 ${
                                    isGeneratingTasks ? 'bg-gray-400 text-gray-700 cursor-not-allowed' : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                                }`}
                            >
                                {isGeneratingTasks ? 'Generating...' : 'Suggest More Tasks ✨'}
                            </button>
                        </div>
                        {currentTasks.length === 0 ? (
                            <p className="text-gray-500">No tasks defined for this trade yet. Click "Add New Task" or "Suggest More Tasks ✨" to add some.</p>
                        ) : (
                            <ul className="space-y-3">
                                {currentTasks.map((task, index) => (
                                    <li
                                        key={index}
                                        className={`flex items-center justify-between p-4 rounded-lg shadow-sm cursor-pointer transition-all duration-200 ${
                                            task.completed ? 'bg-green-100 border-l-4 border-green-500' : 'bg-red-100 border-l-4 border-red-500'
                                        }`}
                                        onClick={() => handleTaskToggle(selectedTrade, index)}
                                    >
                                        <span className={`text-lg ${task.completed ? 'line-through text-gray-600' : 'text-gray-900'}`}>
                                            {task.task}
                                        </span>
                                        <span className={`font-semibold ${task.completed ? 'text-green-700' : 'text-red-700'}`}>
                                            {task.completed ? 'Completed' : 'Pending'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : (
                    <p className="text-center text-gray-500 text-lg">Please select a trade to view its tasks.</p>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center py-10">
            <div id="message-box" className="hidden"></div> {/* Message box element */}
            {currentPage === 'home' && <HomePage />}
            {currentPage === 'unitView' && selectedUnitId && (
                <UnitView unitId={selectedUnitId} onBack={handleBackToHome} />
            )}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
                body {
                    font-family: 'Inter', sans-serif;
                }
            `}</style>
        </div>
    );
};

export default App;