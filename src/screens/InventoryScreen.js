import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { Camera, CameraView } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View
} from 'react-native';
import { auth, db } from '../config/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';

export default function InventoryScreen({ navigation }) {
  useEffect(() => {
    const movementsRef = db.collection('stockMovements');
    const unsubscribeMovements = movementsRef.onSnapshot(async (snapshot) => {
      // Process only added or modified documents to avoid duplicate updates
      const changes = snapshot.docChanges();
      for (const change of changes) {
        if (change.type === 'added' || change.type === 'modified') {
          const mv = change.doc.data();
          const item = items.find(i => i.productCode === mv.productCode);
          if (item) {
            let newStock = item.currentStock;
            if (mv.type === 'out') {
              newStock = item.currentStock - mv.quantity;
            } else {
              newStock = item.currentStock + mv.quantity;
            }
            if (newStock !== item.currentStock) {
              await db.collection('inventory').doc(item.id).update({ currentStock: newStock });
            }
          }
        }
      }
    });
    return () => unsubscribeMovements();
  }, [items]);

  useEffect(() => {
    const salesRef = collection(db, 'sales');
    const salesQuery = query(salesRef);
    const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
      // Handle sales updates here, e.g., refresh local state or trigger UI updates
      console.log('Sales collection updated:', snapshot.docs.map(doc => doc.data()));
      // You can implement logic to update inventory or sales stats based on sales changes
    }, (error) => {
      console.error('Error listening to sales collection:', error);
    });

    return () => unsubscribeSales();
  }, []);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    productCode: '',
    category: '',
    currentStock: '0',
    minimumStock: '0',
    usage: '0',
    price: '0',
    unit: '',
    variancePercentage: 0,
    varianceQuantity: 0,
    createdAt: null,
    lastUpdated: null
  });

  // State for edit form
  const [showEditForm, setShowEditForm] = useState(false);
  const [editItem, setEditItem] = useState(null);

  // Update permission state to include more detailed status
  const [hasPermission, setHasPermission] = useState(null);
  const [permissionError, setPermissionError] = useState(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  const cameraRef = useRef(null);

  const categories = [
    'Tools',
    'Electrical',
    'Plumbing',
    'Carpentry',
    'Paint',
    'Hardware'
  ];

  const units = [
    'pcs',
    'rolls',
    'meters',
    'boxes',
    'sets',
    'pairs',
    'kits',
    'bundles',
    'kg',
    'liters',
    'other'
  ];

  const [isTorchOn, setIsTorchOn] = useState(false);
  const [cameraType, setCameraType] = useState('back');
  const [zoom, setZoom] = useState(0);
  const [scanHistory, setScanHistory] = useState([]);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Add new state for quick stock update
  const [isQuickUpdateMode, setIsQuickUpdateMode] = useState(false);
  const [quickUpdateAmount, setQuickUpdateAmount] = useState('0');
  const [selectedItemForUpdate, setSelectedItemForUpdate] = useState(null);

  // Update the permission request function
  const requestCameraPermission = async () => {
    try {
      console.log('Requesting camera permission...');
      const { status, granted } = await Camera.requestCameraPermissionsAsync();
      console.log('Camera permission status:', status, 'granted:', granted);
      
      if (status === 'granted') {
        setHasPermission(true);
        setPermissionError(null);
        return true;
      } else {
        setHasPermission(false);
        setPermissionError('Camera permission is required to scan barcodes');
        return false;
      }
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      setHasPermission(false);
      setPermissionError('Failed to request camera permission');
      return false;
    }
  };

  // Update useEffect to handle permissions
  useEffect(() => {
    requestCameraPermission();
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      const user = auth.currentUser;
      console.log('Current user ID:', user?.uid);
      if (!user) {
        throw new Error('No user logged in');
      }

      console.log('Starting to fetch inventory items...');
      const itemsRef = db.collection('inventory');
      
      // First, let's get all items without the user filter to check what's in the database
      const allItemsSnapshot = await itemsRef.get();
      console.log('All items in database (without user filter):', allItemsSnapshot.docs.length);
      
      // Fix any items that don't have userId
      const fixPromises = allItemsSnapshot.docs
        .filter(doc => !doc.data().userId)
        .map(doc => {
          console.log('Fixing item without userId:', doc.id);
          return doc.ref.update({
            userId: user.uid,
            lastUpdated: new Date()
          });
        });

      if (fixPromises.length > 0) {
        console.log('Fixing', fixPromises.length, 'items without userId');
        await Promise.all(fixPromises);
        console.log('Successfully fixed items without userId');
      }

      // Now get items with user filter
      const q = itemsRef.where('userId', '==', user.uid);
      console.log('Query created with user ID:', user.uid);

      const unsubscribe = q.onSnapshot(
        (snapshot) => {
          console.log('Received snapshot with docs:', snapshot.docs.length);
          console.log('Snapshot metadata:', snapshot.metadata);
          
          if (snapshot.empty) {
            console.log('No items found in the database for this user');
            setItems([]);
            setLoading(false);
            return;
          }

          const itemsArray = snapshot.docs.map(doc => {
            const data = doc.data();
            console.log('Filtered Item - ID:', doc.id, 'Data:', data);
            return {
              id: doc.id,
              ...data
            };
          });

          console.log('Total items fetched for user:', itemsArray.length);
          console.log('All fetched item IDs:', itemsArray.map(item => item.id));
          
          // Compare with all items to find the missing one
          const missingItems = allItemsSnapshot.docs
            .filter(doc => !itemsArray.some(item => item.id === doc.id))
            .map(doc => ({ id: doc.id, data: doc.data() }));
          
          if (missingItems.length > 0) {
            console.log('Missing items (not shown in inventory):', missingItems);
            console.log('Possible reasons:');
            missingItems.forEach(item => {
              console.log(`Item ${item.id}:`, {
                hasUserId: !!item.data.userId,
                userId: item.data.userId,
                matchesCurrentUser: item.data.userId === user.uid
              });
            });
          }

          setItems(itemsArray);
          setLoading(false);
        },
        (error) => {
          console.error('Error fetching items:', error);
          console.error('Error details:', {
            code: error.code,
            message: error.message,
            stack: error.stack
          });
          Alert.alert('Error', `Failed to load items: ${error.message}`);
          setLoading(false);
        }
      );

      return () => {
        try {
          unsubscribe();
          console.log('Successfully unsubscribed from inventory updates');
        } catch (error) {
          console.error('Error unsubscribing:', error);
        }
      };
    } catch (error) {
      console.error('Error in loadItems:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      Alert.alert('Error', `Failed to load items: ${error.message}`);
      setLoading(false);
    }
  };

  // Removed manual sync function as per user request

  const calculateVariance = (currentStock, minimumStock) => {
    const current = parseFloat(currentStock) || 0;
    const minimum = parseFloat(minimumStock) || 0;

    // Adjust variance calculation to avoid showing potential loss if minimum stock is zero or very low
    if (minimum === 0) {
      return {
        varianceQuantity: 0,
        variancePercentage: 0
      };
    }

    // Optionally, add a threshold to ignore small variances (e.g., less than 5%)
    const quantity = current - minimum;
    const percentage = (quantity / minimum) * 100;

    if (percentage > -5) { // If variance is within -5%, consider it acceptable
      return {
        varianceQuantity: 0,
        variancePercentage: 0
      };
    }

    return {
      varianceQuantity: quantity,
      variancePercentage: percentage
    };
  };

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.productCode || !newItem.unit) {
      Alert.alert('Error', 'Please fill in all required fields (Item Name, Product Code, and Unit)');
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('No user logged in');
      }

      const now = new Date();
      const currentStock = parseInt(newItem.currentStock) || 0;
      const minimumStock = parseInt(newItem.minimumStock) || currentStock;
      const usage = parseInt(newItem.usage) || 0;
      const price = parseFloat(newItem.price) || 0;

      // Calculate variance using the new function
      const { varianceQuantity, variancePercentage } = calculateVariance(currentStock, minimumStock);

      const itemData = {
        name: newItem.name,
        productCode: newItem.productCode,
        category: newItem.category || 'Tools', // Default to Tools if no category selected
        currentStock,
        minimumStock,
        usage,
        price,
        unit: newItem.unit,
        varianceQuantity,
        variancePercentage,
        createdAt: now,
        lastUpdated: now,
        userId: user.uid
      };

      console.log('Adding new item with data:', itemData);

      await db.collection('inventory').add(itemData);

      setNewItem({
        name: '',
        productCode: '',
        category: '',
        currentStock: '0',
        minimumStock: '0',
        usage: '0',
        price: '0',
        unit: '',
        variancePercentage: 0,
        varianceQuantity: 0,
        createdAt: null,
        lastUpdated: null
      });
      setShowAddForm(false);
      Alert.alert('Success', 'Item added successfully!');
    } catch (error) {
      console.error('Error adding item:', error);
      Alert.alert('Error', 'Failed to add item. Please try again.');
    }
  };

  const handleDeleteItem = async (itemId) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('Deleting item with ID:', itemId);
              await db.collection('inventory').doc(itemId).delete();
              Alert.alert('Success', 'Item deleted successfully!');
            } catch (error) {
              console.error('Error deleting item:', error);
              Alert.alert('Error', 'Failed to delete item');
            }
          }
        }
      ]
    );
  };

  // New function to update an existing item with variance recalculation
  const handleUpdateItem = async (itemId, updatedFields) => {
    try {
      console.log('Starting update for item:', itemId);
      console.log('Update fields:', updatedFields);

      const currentStock = parseInt(updatedFields.currentStock) || 0;
      const minimumStock = parseInt(updatedFields.minimumStock) || currentStock;
      const usage = parseInt(updatedFields.usage) || 0;
      const price = parseFloat(updatedFields.price) || 0;

      // Calculate variance using the new function
      const { varianceQuantity, variancePercentage } = calculateVariance(currentStock, minimumStock);

      const updatedData = {
        name: updatedFields.name,
        productCode: updatedFields.productCode,
        category: updatedFields.category,
        currentStock,
        minimumStock,
        usage,
        price,
        unit: updatedFields.unit,
        varianceQuantity,
        variancePercentage,
        lastUpdated: new Date(),
        userId: auth.currentUser.uid
      };

      console.log('Updating item with variance:', updatedData);

      const docRef = db.collection('inventory').doc(itemId);
      await docRef.update(updatedData);
      
      console.log('Update successful with variance data');
      setShowEditForm(false);
      setEditItem(null);
      Alert.alert('Success', 'Item updated successfully!');
    } catch (error) {
      console.error('Error updating item:', error);
      Alert.alert('Error', `Failed to update item: ${error.message}`);
    }
  };

  // Update the filtered items logic to include category filtering
  const filteredItems = items.filter(item => {
    const matchesSearch = 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.productCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === '' || item.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });
  console.log('Filtered items:', filteredItems);

  // Update the scan button handler to check permissions
  const handleScanPress = async () => {
    if (!hasPermission) {
      const granted = await requestCameraPermission();
      if (!granted) {
        Alert.alert(
          'Camera Permission Required',
          'Please allow camera access to scan barcodes',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings',
              onPress: () => {
                Alert.alert('Please enable camera access in your device settings');
              }
            }
          ]
        );
        return;
      }
    }
    setScannerVisible(true);
  };

  // Modify the barcode scanner handler to support quick update mode
  const handleBarCodeScanned = ({ data }) => {
    Vibration.vibrate(200);
    
    setScanHistory(prev => [{
      code: data,
      timestamp: new Date().toISOString()
    }, ...prev].slice(0, 10));

    if (isQuickUpdateMode) {
      // Find the item with matching product code
      const foundItem = items.find(item => item.productCode === data);
      if (foundItem) {
        setSelectedItemForUpdate(foundItem);
        Alert.alert(
          'Update Stock',
          `Found item: ${foundItem.name}\nCurrent stock: ${foundItem.currentStock}\nAdd amount: ${quickUpdateAmount}`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                setSelectedItemForUpdate(null);
              }
            },
            {
              text: 'Update',
              onPress: () => {
                handleQuickStockUpdate(foundItem.id, foundItem.currentStock, quickUpdateAmount);
              }
            }
          ]
        );
      } else {
        Alert.alert('Not Found', 'No item found with this product code.');
      }
      setScannerVisible(false);
      return;
    }

    // Existing barcode handling logic
    setScannerVisible(false);
    if (showAddForm) {
      setNewItem(prev => ({ ...prev, productCode: data }));
    } else if (showEditForm && editItem) {
      setEditItem(prev => ({ ...prev, productCode: data }));
    }
    Alert.alert('Success', `Barcode scanned: ${data}`);
  };

  const toggleTorch = () => {
    setIsTorchOn(!isTorchOn);
  };

  const toggleCamera = () => {
    setCameraType(current => current === 'back' ? 'front' : 'back');
  };

  const handleZoom = (direction) => {
    setZoom(current => {
      const newZoom = direction === 'in' ? current + 0.1 : current - 0.1;
      return Math.max(0, Math.min(1, newZoom)); // Limit zoom between 0 and 1
    });
  };

  const handleManualSubmit = () => {
    if (!manualCode.trim()) {
      Alert.alert('Error', 'Please enter a code');
      return;
    }
    handleBarCodeScanned({ data: manualCode });
    setManualCode('');
    setShowManualInput(false);
  };

  // Add new function to handle quick stock update
  const handleQuickStockUpdate = async (itemId, currentStock, amountToAdd) => {
    try {
      const newStock = parseInt(currentStock) + parseInt(amountToAdd);
      const updatedData = {
        currentStock: newStock.toString(),
        lastUpdated: new Date(),
      };

      await db.collection('inventory').doc(itemId).update(updatedData);
      Alert.alert('Success', `Stock updated successfully! New stock: ${newStock}`);
      
      // Reset quick update mode
      setIsQuickUpdateMode(false);
      setQuickUpdateAmount('0');
      setSelectedItemForUpdate(null);
    } catch (error) {
      console.error('Error updating stock:', error);
      Alert.alert('Error', 'Failed to update stock. Please try again.');
    }
  };

  // Update the permission status display
  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>Requesting camera permission...</Text>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>
            {permissionError || 'Camera access is required to scan barcodes'}
          </Text>
          <TouchableOpacity 
            style={styles.permissionButton}
            onPress={requestCameraPermission}
          >
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const renderScanner = () => {
    if (!scannerVisible) return null;

    return (
      <View style={styles.scannerContainer}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{
            barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'code39', 'code128', 'code11'],
          }}
          onBarcodeScanned={scannerVisible ? handleBarCodeScanned : undefined}
          enableTorch={isTorchOn}
          facing={cameraType}
          zoom={zoom}
        >
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
            <Text style={styles.scannerText}>Point camera at barcode</Text>
          </View>

          {/* Scanner Controls */}
          <View style={styles.scannerControls}>
            <TouchableOpacity style={styles.controlButton} onPress={toggleTorch}>
              <Ionicons 
                name={isTorchOn ? 'flash' : 'flash-outline'} 
                size={24} 
                color="#fff" 
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlButton} onPress={toggleCamera}>
              <Ionicons 
                name="camera-reverse-outline" 
                size={24} 
                color="#fff" 
              />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.controlButton} 
              onPress={() => handleZoom('in')}
            >
              <Ionicons name="add-circle-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.controlButton} 
              onPress={() => handleZoom('out')}
            >
              <Ionicons name="remove-circle-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.controlButton} 
              onPress={() => setShowManualInput(true)}
            >
              <Ionicons name="keypad-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </CameraView>

        {/* Manual Input Modal */}
        {showManualInput && (
          <View style={styles.manualInputContainer}>
            <View style={styles.manualInputContent}>
              <Text style={styles.manualInputTitle}>Enter Code Manually</Text>
              <TextInput
                style={styles.manualInput}
                value={manualCode}
                onChangeText={setManualCode}
                placeholder="Enter barcode"
                keyboardType="number-pad"
                autoFocus
              />
              <View style={styles.manualInputButtons}>
                <TouchableOpacity 
                  style={[styles.manualInputButton, styles.cancelButton]}
                  onPress={() => {
                    setShowManualInput(false);
                    setManualCode('');
                  }}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.manualInputButton, styles.submitButton]}
                  onPress={handleManualSubmit}
                >
                  <Text style={styles.buttonText}>Submit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity 
          style={styles.closeButton}
          onPress={() => setScannerVisible(false)}
        >
          <Text style={styles.closeButtonText}>Close Scanner</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Add Quick Update Mode UI component
  const renderQuickUpdateMode = () => {
    if (!isQuickUpdateMode) return null;

    return (
      <View style={styles.quickUpdateContainer}>
        <View style={styles.quickUpdateHeader}>
          <View style={styles.quickUpdateTitleContainer}>
            <Ionicons name="add-circle" size={24} color="#007AFF" />
            <Text style={styles.quickUpdateTitle}>Quick Stock Update</Text>
          </View>
          <TouchableOpacity 
            style={styles.closeQuickUpdateButton}
            onPress={() => {
              setIsQuickUpdateMode(false);
              setQuickUpdateAmount('0');
              setSelectedItemForUpdate(null);
            }}
          >
            <Ionicons name="close-circle" size={24} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.quickUpdateContent}>
          <View style={styles.quickUpdateCard}>
            <View style={styles.amountInputContainer}>
              <Text style={styles.quickUpdateLabel}>Amount to Add</Text>
              <View style={styles.amountInputWrapper}>
                <TextInput
                  style={styles.quickUpdateInput}
                  value={quickUpdateAmount}
                  onChangeText={(text) => {
                    const currentValue = text === '' ? '0' : text.replace(/^0+/, '') || '0';
                    setQuickUpdateAmount(currentValue);
                  }}
                  keyboardType="numeric"
                  placeholder="Enter amount"
                  placeholderTextColor="#999"
                />
                <View style={styles.amountButtons}>
                  <TouchableOpacity 
                    style={styles.amountButton}
                    onPress={() => {
                      const current = parseInt(quickUpdateAmount) || 0;
                      setQuickUpdateAmount((current + 1).toString());
                    }}
                  >
                    <Ionicons name="add" size={20} color="#007AFF" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.amountButton}
                    onPress={() => {
                      const current = parseInt(quickUpdateAmount) || 0;
                      if (current > 0) {
                        setQuickUpdateAmount((current - 1).toString());
                      }
                    }}
                  >
                    <Ionicons name="remove" size={20} color="#007AFF" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.scanButton}
              onPress={handleScanPress}
            >
              <Ionicons name="scan-outline" size={24} color="#fff" />
              <Text style={styles.scanButtonText}>Scan Item Barcode</Text>
            </TouchableOpacity>
          </View>

          {selectedItemForUpdate && (
            <View style={styles.selectedItemCard}>
              <View style={styles.selectedItemHeader}>
                <Ionicons name="cube" size={20} color="#007AFF" />
                <Text style={styles.selectedItemTitle}>Selected Item</Text>
              </View>
              
              <View style={styles.selectedItemContent}>
                <View style={styles.itemInfoRow}>
                  <Text style={styles.itemInfoLabel}>Name:</Text>
                  <Text style={styles.itemInfoValue}>{selectedItemForUpdate.name}</Text>
                </View>
                
                <View style={styles.itemInfoRow}>
                  <Text style={styles.itemInfoLabel}>Code:</Text>
                  <Text style={styles.itemInfoValue}>#{selectedItemForUpdate.productCode}</Text>
                </View>

                <View style={styles.stockUpdateInfo}>
                  <View style={styles.stockInfoRow}>
                    <Text style={styles.stockInfoLabel}>Current Stock:</Text>
                    <Text style={styles.stockInfoValue}>
                      {selectedItemForUpdate.currentStock} {selectedItemForUpdate.unit}
                    </Text>
                  </View>
                  
                  <View style={styles.stockInfoRow}>
                    <Text style={styles.stockInfoLabel}>Adding:</Text>
                    <Text style={styles.stockInfoValue}>
                      +{quickUpdateAmount} {selectedItemForUpdate.unit}
                    </Text>
                  </View>

                  <View style={styles.newStockRow}>
                    <Text style={styles.newStockLabel}>New Stock:</Text>
                    <Text style={styles.newStockValue}>
                      {parseInt(selectedItemForUpdate.currentStock) + parseInt(quickUpdateAmount)} {selectedItemForUpdate.unit}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity 
                  style={styles.updateButton}
                  onPress={() => {
                    handleQuickStockUpdate(
                      selectedItemForUpdate.id,
                      selectedItemForUpdate.currentStock,
                      quickUpdateAmount
                    );
                  }}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.updateButtonText}>Update Stock</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!selectedItemForUpdate && (
            <View style={styles.scanPrompt}>
              <Ionicons name="scan-outline" size={48} color="#ccc" />
              <Text style={styles.scanPromptText}>Scan an item to update its stock</Text>
              <Text style={styles.scanPromptSubtext}>
                Enter the amount above and scan the item's barcode
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  // Add Quick Update button to the header
  const renderHeaderButtons = () => (
    <View style={styles.headerButtons}>
      <TouchableOpacity 
        style={[styles.headerButton, isQuickUpdateMode && styles.headerButtonActive]}
        onPress={() => setIsQuickUpdateMode(!isQuickUpdateMode)}
      >
        <Ionicons 
          name="add-circle-outline" 
          size={20} 
          color={isQuickUpdateMode ? '#fff' : '#007AFF'} 
        />
        <Text style={[
          styles.headerButtonText,
          isQuickUpdateMode && styles.headerButtonTextActive
        ]}>
          Quick Update
        </Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={styles.headerButton}
        onPress={() => setShowAddForm(!showAddForm)}
      >
        <Ionicons 
          name={showAddForm ? "close" : "add"} 
          size={20} 
          color="#007AFF" 
        />
        <Text style={styles.headerButtonText}>
          {showAddForm ? 'Cancel' : 'Add Item'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading inventory...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search and Add Item Section */}
      <View style={styles.headerContainer}>
        <View style={styles.searchSection}>
          <View style={styles.searchBarContainer}>
            <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
              placeholder="Search inventory..."
              placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
            {searchQuery.length > 0 && (
        <TouchableOpacity 
                style={styles.clearSearchButton}
                onPress={() => setSearchQuery('')}
              >
                <Ionicons name="close-circle" size={20} color="#666" />
              </TouchableOpacity>
            )}
          </View>
          {renderHeaderButtons()}
        </View>

        {/* Category Filter */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.categoryFilterContainer}
          contentContainerStyle={styles.categoryFilterContent}
        >
          <TouchableOpacity
            style={[
              styles.categoryFilterButton,
              selectedCategory === '' && styles.categoryFilterButtonActive
            ]}
            onPress={() => setSelectedCategory('')}
          >
            <Ionicons 
              name="apps" 
              size={16} 
              color={selectedCategory === '' ? 'white' : '#666'} 
              style={styles.categoryIcon}
            />
            <Text style={[
              styles.categoryFilterText,
              selectedCategory === '' && styles.categoryFilterTextActive
            ]}>
              All Items
          </Text>
        </TouchableOpacity>
          
          {categories.map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryFilterButton,
                selectedCategory === category && styles.categoryFilterButtonActive
              ]}
              onPress={() => setSelectedCategory(category)}
            >
              <Ionicons 
                name={getCategoryIcon(category)} 
                size={16} 
                color={selectedCategory === category ? 'white' : '#666'} 
                style={styles.categoryIcon}
              />
              <Text style={[
                styles.categoryFilterText,
                selectedCategory === category && styles.categoryFilterTextActive
              ]}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Add Item Form */}
      {showAddForm && !scannerVisible && (
        <ScrollView style={styles.formContainer}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Add New Item</Text>
          </View>
          
          <View style={styles.formContent}>
            {/* Basic Information Section */}
          <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>Basic Information</Text>
              
              <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Item Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter item name"
              value={newItem.name}
              onChangeText={(text) => setNewItem({...newItem, name: text})}
                  placeholderTextColor="#999"
            />
              </View>
            
              <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Product Code *</Text>
                <View style={styles.codeInputContainer}>
              <TextInput
                    style={[styles.input, styles.codeInput]}
                placeholder="Enter product code"
                value={newItem.productCode}
                onChangeText={(text) => setNewItem({ ...newItem, productCode: text })}
                    placeholderTextColor="#999"
              />
              <TouchableOpacity
                    style={styles.scanButton}
                    onPress={handleScanPress}
                  >
                    <Ionicons name="scan-outline" size={24} color="#fff" />
                    <Text style={styles.scanButtonText}>Scan</Text>
              </TouchableOpacity>
                </View>
            </View>
            
              <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Category</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={newItem.category}
                onValueChange={(itemValue) => setNewItem({...newItem, category: itemValue})}
                style={styles.picker}
              >
                    <Picker.Item label="Select a category" value="" color="#999" />
                {categories.map((category) => (
                  <Picker.Item key={category} label={category} value={category} />
                ))}
              </Picker>
                </View>
            </View>
          </View>

            {/* Stock Information Section */}
          <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>Stock Information</Text>
              
              <View style={styles.stockGrid}>
                <View style={styles.stockInputGroup}>
            <Text style={styles.inputLabel}>On Hand Stock</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              value={newItem.currentStock}
              onChangeText={(text) => {
                      // Ensure the value is never empty
                      const currentValue = text === '' ? '0' : text.replace(/^0+/, '') || '0';
                setNewItem({...newItem, currentStock: currentValue});
                // If total stock is not set, update it to match current stock
                if (!newItem.minimumStock || newItem.minimumStock === '0') {
                  setNewItem(prev => ({...prev, minimumStock: currentValue}));
                }
              }}
              keyboardType="numeric"
                    placeholderTextColor="#999"
            />
                </View>
            
                <View style={styles.stockInputGroup}>
            <Text style={styles.inputLabel}>Total Stock</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              value={newItem.minimumStock}
                    onChangeText={(text) => {
                      // Ensure the value is never empty
                      const currentValue = text === '' ? '0' : text.replace(/^0+/, '') || '0';
                      setNewItem({...newItem, minimumStock: currentValue});
                    }}
              keyboardType="numeric"
                    placeholderTextColor="#999"
            />
                </View>
              </View>
            
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Usage</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              value={newItem.usage}
                  onChangeText={(text) => {
                    // Ensure the value is never empty
                    const currentValue = text === '' ? '0' : text.replace(/^0+/, '') || '0';
                    setNewItem({...newItem, usage: currentValue});
                  }}
              keyboardType="numeric"
                  placeholderTextColor="#999"
            />
              </View>
          </View>

            {/* Price and Unit Section */}
          <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>Price and Unit</Text>
              
              <View style={styles.priceUnitGrid}>
                <View style={styles.priceInputGroup}>
            <Text style={styles.inputLabel}>Price</Text>
                  <View style={styles.priceInputContainer}>
                    <Text style={styles.currencySymbol}>₱</Text>
            <TextInput
                      style={[styles.input, styles.priceInput]}
                      placeholder="0.00"
              value={newItem.price}
                      onChangeText={(text) => {
                        // Ensure the value is never empty and handle decimal input
                        const currentValue = text === '' ? '0' : 
                          text.replace(/^0+(\d)/, '$1') // Remove leading zeros
                             .replace(/[^0-9.]/g, '') // Only allow numbers and decimal
                             .replace(/(\..*)\./g, '$1') // Only allow one decimal point
                             || '0';
                        setNewItem({...newItem, price: currentValue});
                      }}
              keyboardType="decimal-pad"
                      placeholderTextColor="#999"
            />
                  </View>
                </View>
            
                <View style={styles.unitInputGroup}>
            <Text style={styles.inputLabel}>Unit *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={newItem.unit}
                onValueChange={(itemValue) => setNewItem({...newItem, unit: itemValue})}
                style={styles.picker}
              >
                      <Picker.Item label="Select unit" value="" color="#999" />
                {units.map((unit) => (
                  <Picker.Item key={unit} label={unit} value={unit} />
                ))}
              </Picker>
                  </View>
                </View>
              </View>
            </View>
          </View>
          
          <View style={styles.formFooter}>
            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={() => setShowAddForm(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          <TouchableOpacity 
            style={styles.submitButton}
            onPress={handleAddItem}
          >
            <Text style={styles.submitButtonText}>Add Item</Text>
          </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Edit Item Form */}
      {showEditForm && editItem && !scannerVisible && (
        <ScrollView style={styles.formContainer}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Edit Item</Text>
          </View>
          
          <View style={styles.formContent}>
            {/* Basic Information Section */}
          <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>Basic Information</Text>
              
              <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Item Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter item name"
              value={editItem.name}
              onChangeText={(text) => setEditItem({...editItem, name: text})}
                  placeholderTextColor="#999"
            />
              </View>
            
              <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Product Code *</Text>
                <View style={styles.codeInputContainer}>
              <TextInput
                    style={[styles.input, styles.codeInput]}
                placeholder="Enter product code"
                value={editItem.productCode}
                onChangeText={(text) => setEditItem({ ...editItem, productCode: text })}
                    placeholderTextColor="#999"
              />
              <TouchableOpacity
                    style={styles.scanButton}
                    onPress={handleScanPress}
                  >
                    <Ionicons name="scan-outline" size={24} color="#fff" />
                    <Text style={styles.scanButtonText}>Scan</Text>
              </TouchableOpacity>
                </View>
            </View>
            
              <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Category</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={editItem.category}
                onValueChange={(itemValue) => setEditItem({...editItem, category: itemValue})}
                style={styles.picker}
              >
                    <Picker.Item label="Select a category" value="" color="#999" />
                {categories.map((category) => (
                  <Picker.Item key={category} label={category} value={category} />
                ))}
              </Picker>
                </View>
            </View>
          </View>

            {/* Stock Information Section */}
          <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>Stock Information</Text>
              
              <View style={styles.stockGrid}>
                <View style={styles.stockInputGroup}>
            <Text style={styles.inputLabel}>On Hand Stock</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              value={editItem.currentStock.toString()}
              onChangeText={(text) => {
                      const currentValue = text === '' ? '0' : text.replace(/^0+/, '') || '0';
                setEditItem({...editItem, currentStock: currentValue});
              }}
              keyboardType="numeric"
                    placeholderTextColor="#999"
            />
                </View>
            
                <View style={styles.stockInputGroup}>
            <Text style={styles.inputLabel}>Total Stock</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              value={editItem.minimumStock.toString()}
                    onChangeText={(text) => {
                      const currentValue = text === '' ? '0' : text.replace(/^0+/, '') || '0';
                      setEditItem({...editItem, minimumStock: currentValue});
                    }}
              keyboardType="numeric"
                    placeholderTextColor="#999"
            />
                </View>
              </View>
            
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Usage</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              value={editItem.usage.toString()}
                  onChangeText={(text) => {
                    const currentValue = text === '' ? '0' : text.replace(/^0+/, '') || '0';
                    setEditItem({...editItem, usage: currentValue});
                  }}
              keyboardType="numeric"
                  placeholderTextColor="#999"
            />
              </View>
          </View>

            {/* Price and Unit Section */}
          <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>Price and Unit</Text>
              
              <View style={styles.priceUnitGrid}>
                <View style={styles.priceInputGroup}>
            <Text style={styles.inputLabel}>Price</Text>
                  <View style={styles.priceInputContainer}>
                    <Text style={styles.currencySymbol}>₱</Text>
            <TextInput
                      style={[styles.input, styles.priceInput]}
                      placeholder="0.00"
              value={editItem.price.toString()}
                      onChangeText={(text) => {
                        const currentValue = text === '' ? '0' : 
                          text.replace(/^0+(\d)/, '$1')
                             .replace(/[^0-9.]/g, '')
                             .replace(/(\..*)\./g, '$1')
                             || '0';
                        setEditItem({...editItem, price: currentValue});
                      }}
              keyboardType="decimal-pad"
                      placeholderTextColor="#999"
            />
                  </View>
                </View>
            
                <View style={styles.unitInputGroup}>
            <Text style={styles.inputLabel}>Unit *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={editItem.unit}
                onValueChange={(itemValue) => setEditItem({...editItem, unit: itemValue})}
                style={styles.picker}
              >
                      <Picker.Item label="Select unit" value="" color="#999" />
                {units.map((unit) => (
                  <Picker.Item key={unit} label={unit} value={unit} />
                ))}
              </Picker>
                  </View>
                </View>
              </View>
            </View>
          </View>
          
          <View style={styles.formFooter}>
            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={() => {
                setShowEditForm(false);
                setEditItem(null);
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          <TouchableOpacity 
            style={styles.submitButton}
            onPress={() => handleUpdateItem(editItem.id, editItem)}
          >
            <Text style={styles.submitButtonText}>Update Item</Text>
          </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Items List */}
      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const { varianceQuantity, variancePercentage } = calculateVariance(item.currentStock, item.minimumStock);
          const losses = varianceQuantity < 0 ? Math.abs(varianceQuantity) * (item.price || 0) : 0;
          return (
            <View style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <View style={styles.itemTitleContainer}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.category && (
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryText}>{item.category}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.itemCode}>#{item.productCode}</Text>
              </View>

              <View style={styles.itemContent}>
                <View style={styles.stockInfo}>
                  <View style={styles.stockRow}>
                    <View style={styles.stockItem}>
                      <Text style={styles.stockLabel}>On Hand</Text>
                      <Text style={styles.stockValue}>{item.currentStock} {item.unit}</Text>
                    </View>
                    <View style={styles.stockItem}>
                      <Text style={styles.stockLabel}>Total</Text>
                      <Text style={styles.stockValue}>{item.minimumStock} {item.unit}</Text>
                    </View>
                    <View style={styles.stockItem}>
                      <Text style={styles.stockLabel}>Usage</Text>
                      <Text style={styles.stockValue}>{item.usage} {item.unit}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.priceContainer}>
                    <Text style={styles.priceLabel}>Price</Text>
                    <Text style={styles.priceValue}>₱{item.price?.toFixed(2)}</Text>
                  </View>
                </View>

                <View style={styles.varianceContainer}>
                  <View style={[
                    styles.varianceBadge,
                    varianceQuantity > 0 ? styles.positiveVarianceBadge :
                    varianceQuantity < 0 ? styles.negativeVarianceBadge :
                    styles.neutralVarianceBadge
                  ]}>
                    <Text style={[
                      styles.varianceText,
                      varianceQuantity > 0 ? styles.positiveVarianceText :
                      varianceQuantity < 0 ? styles.negativeVarianceText :
                      styles.neutralVarianceText
                    ]}>
                      {varianceQuantity > 0 ? '↑' : varianceQuantity < 0 ? '↓' : '='} 
                      {Math.abs(varianceQuantity)} {item.unit} ({Math.abs(variancePercentage).toFixed(1)}%)
                  </Text>
                  </View>

                  {varianceQuantity < 0 && (
                    <View style={styles.lossesContainer}>
                      <Ionicons name="alert-circle" size={16} color="#C62828" />
                      <Text style={styles.lossesText}>
                        Potential Loss: ₱{losses.toFixed(2)}
                    </Text>
                    </View>
                  )}
                </View>

                <View style={styles.itemFooter}>
                  <Text style={styles.lastUpdated}>
                    Updated: {item.lastUpdated?.toDate().toLocaleDateString()}
                </Text>
                  <View style={styles.actionButtons}>
                <TouchableOpacity 
                  style={[styles.actionButton, styles.editButton]}
                  onPress={() => {
                    setEditItem(item);
                    setShowEditForm(true);
                  }}
                >
                      <Ionicons name="pencil" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => handleDeleteItem(item.id)}
                >
                      <Ionicons name="trash" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>Delete</Text>
                </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          );
        }}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No items found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? 'Try a different search term' : 'Add your first inventory item'}
            </Text>
          </View>
        }
      />

      {renderScanner()}
      {renderQuickUpdateMode()}
    </View>
  );
}

const getCategoryIcon = (category) => {
  const icons = {
    'Tools': 'hammer',
    'Electrical': 'flash',
    'Plumbing': 'water',
    'Carpentry': 'construct',
    'Paint': 'color-palette',
    'Hardware': 'hardware-chip'
  };
  return icons[category] || 'cube';
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerContainer: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingTop: 10,
  },
  searchSection: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingBottom: 10,
    gap: 10,
    alignItems: 'center',
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    height: '100%',
  },
  clearSearchButton: {
    padding: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  categoryFilterContainer: {
    backgroundColor: 'white',
  },
  categoryFilterContent: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    gap: 8,
  },
  categoryFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginRight: 8,
  },
  categoryFilterButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryIcon: {
    marginRight: 6,
  },
  categoryFilterText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  categoryFilterTextActive: {
    color: 'white',
  },
  formContainer: {
    backgroundColor: 'white',
    margin: 15,
    borderRadius: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  formHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  formContent: {
    padding: 20,
  },
  formSection: {
    marginBottom: 25,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  inputGroup: {
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    color: '#333',
  },
  codeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  codeInput: {
    flex: 1,
  },
  scanButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  scanButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  pickerContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  stockGrid: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 15,
  },
  stockInputGroup: {
    flex: 1,
  },
  priceUnitGrid: {
    flexDirection: 'row',
    gap: 15,
  },
  priceInputGroup: {
    flex: 1,
  },
  unitInputGroup: {
    flex: 1,
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  currencySymbol: {
    fontSize: 16,
    color: '#666',
    paddingHorizontal: 12,
  },
  priceInput: {
    flex: 1,
    borderWidth: 0,
  },
  formFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  cancelButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 15,
    paddingBottom: 30,
  },
  itemCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  itemHeader: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fafafa',
  },
  itemTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  itemName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  categoryBadge: {
    backgroundColor: '#E8F2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '500',
  },
  itemCode: {
    fontSize: 13,
    color: '#666',
    fontFamily: 'monospace',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  itemContent: {
    padding: 15,
  },
  stockInfo: {
    marginBottom: 15,
    backgroundColor: '#fafafa',
    borderRadius: 8,
    padding: 12,
  },
  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  stockItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 8,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  stockLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  stockValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  priceLabel: {
    fontSize: 12,
    color: '#666',
    marginRight: 8,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
  },
  varianceContainer: {
    marginBottom: 15,
    padding: 12,
    backgroundColor: '#fafafa',
    borderRadius: 8,
  },
  varianceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  positiveVarianceBadge: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#2E7D32',
  },
  negativeVarianceBadge: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#C62828',
  },
  neutralVarianceBadge: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#1565C0',
  },
  varianceText: {
    fontSize: 13,
    fontWeight: '500',
  },
  positiveVarianceText: {
    color: '#2E7D32',
  },
  negativeVarianceText: {
    color: '#C62828',
  },
  neutralVarianceText: {
    color: '#1565C0',
  },
  lossesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C62828',
  },
  lossesText: {
    color: '#C62828',
    fontSize: 13,
    marginLeft: 6,
    fontWeight: '500',
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fafafa',
  },
  lastUpdated: {
    fontSize: 12,
    color: '#999',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  editButton: {
    backgroundColor: '#007AFF',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    marginTop: 50,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  scannerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'black',
    zIndex: 1000,
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'transparent',
  },
  scannerText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 20,
    textAlign: 'center',
  },
  scannerControls: {
    position: 'absolute',
    right: 20,
    top: '50%',
    transform: [{ translateY: -100 }],
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 10,
  },
  controlButton: {
    padding: 10,
    marginVertical: 5,
  },
  manualInputContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualInputContent: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '80%',
  },
  manualInputTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  manualInput: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 15,
  },
  manualInputButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  manualInputButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    marginHorizontal: 5,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  permissionText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    gap: 6,
  },
  headerButtonActive: {
    backgroundColor: '#007AFF',
  },
  headerButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  headerButtonTextActive: {
    color: '#fff',
  },
  quickUpdateContainer: {
    backgroundColor: 'white',
    margin: 15,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  quickUpdateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  quickUpdateTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickUpdateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeQuickUpdateButton: {
    padding: 4,
  },
  quickUpdateContent: {
    padding: 15,
  },
  quickUpdateCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  amountInputContainer: {
    marginBottom: 15,
  },
  quickUpdateLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
  quickUpdateInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  amountButtons: {
    flexDirection: 'row',
    borderLeftWidth: 1,
    borderLeftColor: '#ddd',
  },
  amountButton: {
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: '#ddd',
  },
  scanButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  scanButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedItemCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  selectedItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#E8F2FF',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 8,
  },
  selectedItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  selectedItemContent: {
    padding: 15,
  },
  itemInfoRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  itemInfoLabel: {
    width: 80,
    fontSize: 14,
    color: '#666',
  },
  itemInfoValue: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  stockUpdateInfo: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  stockInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stockInfoLabel: {
    fontSize: 14,
    color: '#666',
  },
  stockInfoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  newStockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  newStockLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
  },
  newStockValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
  },
  updateButton: {
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  updateButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  scanPrompt: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  scanPromptText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
    textAlign: 'center',
  },
  scanPromptSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
}); 