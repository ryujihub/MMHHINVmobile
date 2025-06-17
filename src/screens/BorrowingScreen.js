import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { auth, db } from '../config/firebase';

export default function BorrowingScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [borrowingRequests, setBorrowingRequests] = useState([]);
  const [newRequest, setNewRequest] = useState({
    itemId: '',
    itemName: '',
    quantity: '1',
    purpose: '',
    expectedReturnDate: '',
    status: 'pending',
    requestedBy: '',
    requestedAt: null,
    approvedBy: '',
    approvedAt: null,
    returnedAt: null
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const categories = [
    'Tools',
    'Electrical',
    'Plumbing',
    'Carpentry',
    'Paint',
    'Hardware'
  ];

  useEffect(() => {
    loadItems();
    loadBorrowingRequests();
  }, []);

  const loadItems = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        setError('No user logged in');
        setLoading(false);
        return;
      }

      const itemsRef = db.collection('inventory');
      const q = itemsRef.where('userId', '==', user.uid);

      const unsubscribe = q.onSnapshot(
        (snapshot) => {
          const itemsArray = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          console.log('=== BORROWING SCREEN DEBUG ===');
          console.log('Total items in inventory:', itemsArray.length);
          console.log('All items with their categories:', itemsArray.map(item => ({
            name: item.name,
            category: item.category || 'No category',
            id: item.id,
            currentStock: item.currentStock
          })));
          
          // Show items from categories that are typically borrowed
          const borrowableCategories = ['Tools', 'Electrical', 'Plumbing', 'Carpentry', 'Paint', 'Hardware'];
          const filteredItems = itemsArray.filter(item => {
            const isBorrowable = borrowableCategories.includes(item.category);
            console.log(`Item ${item.name}:`, {
              category: item.category,
              isBorrowable,
              currentStock: item.currentStock
            });
            return isBorrowable;
          });
          
          console.log('Items that match borrowable categories:', filteredItems.map(item => ({
            name: item.name,
            category: item.category,
            id: item.id,
            currentStock: item.currentStock
          })));
          console.log('=== END DEBUG ===');
          
          setItems(filteredItems);
          setLoading(false);
        },
        (error) => {
          console.error('Error fetching items:', error);
          Alert.alert('Error', 'Failed to load items');
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (error) {
      console.error('Error in loadItems:', error);
      Alert.alert('Error', 'Failed to load items');
      setLoading(false);
    }
  };

  const loadBorrowingRequests = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const requestsRef = db.collection('borrowingRequests');
      const q = requestsRef.where('requestedBy', '==', user.uid);

      const unsubscribe = q.onSnapshot(
        (snapshot) => {
          const requestsArray = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setBorrowingRequests(requestsArray);
        },
        (error) => {
          console.error('Error fetching borrowing requests:', error);
          Alert.alert('Error', 'Failed to load borrowing requests');
        }
      );

      return () => unsubscribe();
    } catch (error) {
      console.error('Error in loadBorrowingRequests:', error);
      Alert.alert('Error', 'Failed to load borrowing requests');
    }
  };

  const handleCreateRequest = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Error', 'You must be logged in to create a borrowing request');
        return;
      }

      // Validate required fields
      if (!selectedItem) {
        Alert.alert('Error', 'Please select an item to borrow');
        return;
      }

      if (!newRequest.purpose.trim()) {
        Alert.alert('Error', 'Please provide a purpose for borrowing');
        return;
      }

      if (!newRequest.expectedReturnDate) {
        Alert.alert('Error', 'Please select an expected return date');
        return;
      }

      // Validate quantity
      const quantity = parseInt(newRequest.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        Alert.alert('Error', 'Please enter a valid quantity');
        return;
      }

      if (quantity > selectedItem.currentStock) {
        Alert.alert('Error', 'Requested quantity exceeds available stock');
        return;
      }

      console.log('Creating borrowing request:', {
        item: selectedItem.name,
        quantity: newRequest.quantity,
        purpose: newRequest.purpose,
        returnDate: newRequest.expectedReturnDate
      });

      // Prepare request data with additional metadata
      const requestData = {
        ...newRequest,
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        requestedBy: user.uid,
        requestedAt: new Date(),
        status: 'pending',
        itemCategory: selectedItem.category,
        itemUnit: selectedItem.unit,
        currentStock: selectedItem.currentStock
      };

      // Save to Firestore
      await db.collection('borrowingRequests').add(requestData);
      
      Alert.alert('Success', 'Borrowing request submitted successfully');
      
      // Reset form
      setShowRequestForm(false);
      setSelectedItem(null);
      setNewRequest({
        itemId: '',
        itemName: '',
        quantity: '1',
        purpose: '',
        expectedReturnDate: '',
        status: 'pending',
        requestedBy: '',
        requestedAt: null,
        approvedBy: '',
        approvedAt: null,
        returnedAt: null
      });
    } catch (error) {
      console.error('Error creating borrowing request:', error);
      Alert.alert('Error', 'Failed to create borrowing request. Please try again.');
    }
  };

  const handleReturnItem = async (requestId) => {
    try {
      console.log('Processing return for request:', requestId);
      
      // Get the request details
      const requestDoc = await db.collection('borrowingRequests').doc(requestId).get();
      const requestData = requestDoc.data();
      
      if (!requestData) {
        throw new Error('Request not found');
      }

      // Update the request status
      await db.collection('borrowingRequests').doc(requestId).update({
        status: 'returned',
        returnedAt: new Date()
      });

      // Update the item's current stock
      const itemRef = db.collection('inventory').doc(requestData.itemId);
      const itemDoc = await itemRef.get();
      const itemData = itemDoc.data();

      if (itemData) {
        const newStock = itemData.currentStock + parseInt(requestData.quantity);
        await itemRef.update({
          currentStock: newStock,
          lastUpdated: new Date()
        });
      }

      Alert.alert('Success', 'Item marked as returned');
      console.log('Item returned successfully');
    } catch (error) {
      console.error('Error returning item:', error);
      Alert.alert('Error', 'Failed to mark item as returned. Please try again.');
    }
  };

  const handleDateChange = (event, date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
      setNewRequest({
        ...newRequest,
        expectedReturnDate: date.toISOString().split('T')[0] // Format as YYYY-MM-DD
      });
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.productCode.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === '' || item.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading tools...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Tool Borrowing</Text>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => navigation.navigate('Inventory')}
          >
            <Ionicons name="list" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search and Filter */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search tools..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <View style={styles.categoryFilter}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[
                styles.categoryButton,
                selectedCategory === '' && styles.categoryButtonActive
              ]}
              onPress={() => setSelectedCategory('')}
            >
              <Text style={[
                styles.categoryButtonText,
                selectedCategory === '' && styles.categoryButtonTextActive
              ]}>All</Text>
            </TouchableOpacity>
            {categories.map(category => (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryButton,
                  selectedCategory === category && styles.categoryButtonActive
                ]}
                onPress={() => setSelectedCategory(category)}
              >
                <Text style={[
                  styles.categoryButtonText,
                  selectedCategory === category && styles.categoryButtonTextActive
                ]}>{category}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Borrowing Request Form */}
      {showRequestForm && (
        <View style={styles.formContainer}>
          <ScrollView style={styles.formScroll}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Request to Borrow Tool</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => {
                  setShowRequestForm(false);
                  setSelectedItem(null);
                }}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.formContent}>
              {/* Item Selection */}
              <View style={styles.formSection}>
                <Text style={styles.sectionTitle}>Select Tool</Text>
                {selectedItem ? (
                  <View style={styles.selectedItemCard}>
                    <View style={styles.selectedItemHeader}>
                      <Ionicons name="hammer" size={20} color="#007AFF" />
                      <Text style={styles.selectedItemTitle}>{selectedItem.name}</Text>
                    </View>
                    <View style={styles.selectedItemContent}>
                      <View style={styles.itemInfoRow}>
                        <Text style={styles.itemInfoLabel}>Code:</Text>
                        <Text style={styles.itemInfoValue}>#{selectedItem.productCode}</Text>
                      </View>
                      <View style={styles.itemInfoRow}>
                        <Text style={styles.itemInfoLabel}>Available:</Text>
                        <Text style={styles.itemInfoValue}>
                          {selectedItem.currentStock} {selectedItem.unit}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={styles.itemSelectionPrompt}>
                    <Text style={styles.promptText}>Select a tool from the list below</Text>
                  </View>
                )}
              </View>

              {/* Request Details */}
              <View style={styles.formSection}>
                <Text style={styles.sectionTitle}>Request Details</Text>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Quantity</Text>
                  <TextInput
                    style={styles.input}
                    value={newRequest.quantity}
                    onChangeText={(text) => {
                      const value = text.replace(/[^0-9]/g, '');
                      setNewRequest({...newRequest, quantity: value || '1'});
                    }}
                    keyboardType="numeric"
                    placeholder="1"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Purpose</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={newRequest.purpose}
                    onChangeText={(text) => setNewRequest({...newRequest, purpose: text})}
                    placeholder="What will you use this tool for?"
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Expected Return Date</Text>
                  <TouchableOpacity
                    style={styles.dateInput}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={styles.dateInputText}>
                      {newRequest.expectedReturnDate || 'Select date'}
                    </Text>
                    <Ionicons name="calendar" size={20} color="#666" />
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={selectedDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleDateChange}
                      minimumDate={new Date()} // Can't select past dates
                      style={styles.datePicker}
                    />
                  )}
                </View>
              </View>

              <View style={styles.formFooter}>
                <TouchableOpacity 
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowRequestForm(false);
                    setSelectedItem(null);
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[
                    styles.submitButton,
                    (!selectedItem || !newRequest.purpose || !newRequest.expectedReturnDate) && 
                    styles.submitButtonDisabled
                  ]}
                  onPress={handleCreateRequest}
                  disabled={!selectedItem || !newRequest.purpose || !newRequest.expectedReturnDate}
                >
                  <Text style={styles.submitButtonText}>Submit Request</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      {/* Tools List */}
      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.itemCard}
            onPress={() => {
              setSelectedItem(item);
              setShowRequestForm(true);
            }}
          >
            <View style={styles.itemHeader}>
              <View style={styles.itemTitleContainer}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{item.category}</Text>
                </View>
              </View>
              <Text style={styles.itemCode}>#{item.productCode}</Text>
            </View>

            <View style={styles.itemContent}>
              <View style={styles.stockInfo}>
                <View style={styles.stockRow}>
                  <View style={styles.stockItem}>
                    <Text style={styles.stockLabel}>Available</Text>
                    <Text style={styles.stockValue}>
                      {item.currentStock} {item.unit}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.itemFooter}>
              <TouchableOpacity 
                style={styles.borrowButton}
                onPress={() => {
                  setSelectedItem(item);
                  setShowRequestForm(true);
                }}
              >
                <Ionicons name="hand-left" size={18} color="#fff" />
                <Text style={styles.borrowButtonText}>Request to Borrow</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="hammer-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No tools available</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? 'Try a different search term' : 'Add tools to your inventory'}
            </Text>
          </View>
        }
      />

      {/* Active Borrowing Requests */}
      <View style={styles.requestsContainer}>
        <Text style={styles.requestsTitle}>Your Borrowing Requests</Text>
        <FlatList
          data={borrowingRequests}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.requestCard}>
              <View style={styles.requestHeader}>
                <Text style={styles.requestItemName}>{item.itemName}</Text>
                <View style={[
                  styles.statusBadge,
                  item.status === 'approved' && styles.statusApproved,
                  item.status === 'pending' && styles.statusPending,
                  item.status === 'returned' && styles.statusReturned
                ]}>
                  <Text style={styles.statusText}>
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </Text>
                </View>
              </View>
              
              <View style={styles.requestDetails}>
                <View style={styles.requestDetailRow}>
                  <Text style={styles.requestLabel}>Requested:</Text>
                  <Text style={styles.requestValue}>
                    {item.requestedAt?.toDate().toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.requestDetailRow}>
                  <Text style={styles.requestLabel}>Return Date:</Text>
                  <Text style={styles.requestValue}>{item.expectedReturnDate}</Text>
                </View>
                <View style={styles.requestDetailRow}>
                  <Text style={styles.requestLabel}>Purpose:</Text>
                  <Text style={styles.requestValue}>{item.purpose}</Text>
                </View>
              </View>

              {item.status === 'approved' && (
                <TouchableOpacity 
                  style={styles.returnButton}
                  onPress={() => handleReturnItem(item.id)}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.returnButtonText}>Mark as Returned</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyRequestsContainer}>
              <Text style={styles.emptyRequestsText}>No borrowing requests yet</Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: 'white',
    paddingTop: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  headerButton: {
    padding: 8,
  },
  searchContainer: {
    padding: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  categoryFilter: {
    marginTop: 10,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    marginRight: 8,
  },
  categoryButtonActive: {
    backgroundColor: '#007AFF',
  },
  categoryButtonText: {
    fontSize: 14,
    color: '#666',
  },
  categoryButtonTextActive: {
    color: 'white',
  },
  formContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    zIndex: 1000,
  },
  formScroll: {
    flex: 1,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 8,
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
  selectedItemCard: {
    backgroundColor: 'white',
    borderRadius: 8,
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
    padding: 12,
  },
  itemSelectionPrompt: {
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  promptText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
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
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  dateInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  dateInputText: {
    fontSize: 16,
    color: '#333',
  },
  formFooter: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 20,
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
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 15,
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
    backgroundColor: '#fafafa',
    borderRadius: 8,
    padding: 12,
  },
  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  itemFooter: {
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  borrowButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  borrowButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 16,
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
  requestsContainer: {
    padding: 15,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  requestsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  requestCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  requestItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusPending: {
    backgroundColor: '#FFF3E0',
  },
  statusApproved: {
    backgroundColor: '#E8F5E9',
  },
  statusReturned: {
    backgroundColor: '#E3F2FD',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  requestDetails: {
    marginBottom: 15,
  },
  requestDetailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  requestLabel: {
    width: 100,
    fontSize: 14,
    color: '#666',
  },
  requestValue: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  returnButton: {
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  returnButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyRequestsContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyRequestsText: {
    fontSize: 14,
    color: '#999',
  },
  datePicker: {
    width: '100%',
    backgroundColor: 'white',
    marginTop: 8,
  },
}); 