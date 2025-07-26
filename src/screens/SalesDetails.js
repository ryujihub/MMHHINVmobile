import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { auth, db } from '../config/firebase';

export default function SalesDetails({ navigation }) {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setError('No user logged in');
      setLoading(false);
      return;
    }

    const salesRef = collection(db, 'sales');
    const q = query(salesRef, where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const salesArray = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSalesData(salesArray);
      setLoading(false);
    }, (error) => {
      setError('Failed to load sales data');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>Loading sales details...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  // TODO: Add charts and detailed sales metrics here

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Sales Details</Text>
      {salesData.length === 0 ? (
        <Text style={styles.noDataText}>No sales data available.</Text>
      ) : (
        salesData.map(sale => (
          <View key={sale.id} style={styles.saleItem}>
            <Text>Product Code: {sale.productCode}</Text>
            <Text>Quantity Sold: {sale.quantity}</Text>
            <Text>Date: {sale.date?.toDate().toLocaleDateString() || 'N/A'}</Text>
            <Text>Price: ₱{sale.price?.toFixed(2) || 'N/A'}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 15,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'red',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  noDataText: {
    fontSize: 16,
    color: '#666',
  },
  saleItem: {
    marginBottom: 15,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
});
