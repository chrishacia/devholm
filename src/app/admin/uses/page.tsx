'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Skeleton,
  Alert,
  Snackbar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Divider,
  alpha,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  ExpandMore,
  DragIndicator,
  Computer,
  Code,
  Brush,
  Terminal,
  Cloud,
  Chair,
  Build,
  Storage,
  Security,
  Speed,
  Psychology,
  Devices,
  Extension,
  ViewModule,
} from '@mui/icons-material';

// Available icons for categories
const availableIcons: Record<string, React.ElementType> = {
  Computer,
  Code,
  Brush,
  Terminal,
  Cloud,
  Chair,
  Build,
  Storage,
  Security,
  Speed,
  Psychology,
  Devices,
  Extension,
  ViewModule,
};

const iconOptions = Object.keys(availableIcons);

interface UsesItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  url: string | null;
  sort_order: number;
}

interface UsesCategory {
  id: string;
  title: string;
  icon: string;
  sort_order: number;
  items: UsesItem[];
}

function LoadingSkeleton() {
  return (
    <Box>
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} height={80} sx={{ mb: 1 }} />
      ))}
    </Box>
  );
}

export default function UsesAdminPage() {
  const [categories, setCategories] = useState<UsesCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string | false>(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  });

  // Category dialog state
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<UsesCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    title: '',
    icon: 'Build',
    sort_order: 0,
  });

  // Item dialog state
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<UsesItem | null>(null);
  const [itemForm, setItemForm] = useState({
    category_id: '',
    name: '',
    description: '',
    url: '',
    sort_order: 0,
  });

  // Delete dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    type: 'category' | 'item';
    id: string;
    name: string;
  }>({
    open: false,
    type: 'category',
    id: '',
    name: '',
  });

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/uses');
      if (!response.ok) throw new Error('Failed to fetch uses data');
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error('Error fetching uses data:', error);
      setSnackbar({
        open: true,
        message: 'Failed to load uses data',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Category handlers
  const handleOpenCategoryDialog = (category?: UsesCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        title: category.title,
        icon: category.icon,
        sort_order: category.sort_order,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({
        title: '',
        icon: 'Build',
        sort_order: categories.length,
      });
    }
    setCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    try {
      const url = editingCategory
        ? `/api/admin/uses/categories/${editingCategory.id}`
        : '/api/admin/uses';
      const method = editingCategory ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryForm),
      });

      if (!response.ok) throw new Error('Failed to save category');

      setSnackbar({
        open: true,
        message: `Category ${editingCategory ? 'updated' : 'created'} successfully`,
        severity: 'success',
      });
      setCategoryDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving category:', error);
      setSnackbar({
        open: true,
        message: 'Failed to save category',
        severity: 'error',
      });
    }
  };

  // Item handlers
  const handleOpenItemDialog = (categoryId: string, item?: UsesItem) => {
    if (item) {
      setEditingItem(item);
      setItemForm({
        category_id: item.category_id,
        name: item.name,
        description: item.description || '',
        url: item.url || '',
        sort_order: item.sort_order,
      });
    } else {
      setEditingItem(null);
      const category = categories.find((c) => c.id === categoryId);
      setItemForm({
        category_id: categoryId,
        name: '',
        description: '',
        url: '',
        sort_order: category?.items.length || 0,
      });
    }
    setItemDialogOpen(true);
  };

  const handleSaveItem = async () => {
    try {
      const url = editingItem ? `/api/admin/uses/items/${editingItem.id}` : '/api/admin/uses/items';
      const method = editingItem ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemForm),
      });

      if (!response.ok) throw new Error('Failed to save item');

      setSnackbar({
        open: true,
        message: `Item ${editingItem ? 'updated' : 'created'} successfully`,
        severity: 'success',
      });
      setItemDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving item:', error);
      setSnackbar({
        open: true,
        message: 'Failed to save item',
        severity: 'error',
      });
    }
  };

  // Delete handler
  const handleDelete = async () => {
    try {
      const { type, id } = deleteDialog;
      const url =
        type === 'category' ? `/api/admin/uses/categories/${id}` : `/api/admin/uses/items/${id}`;

      const response = await fetch(url, { method: 'DELETE' });

      if (!response.ok) throw new Error('Failed to delete');

      setSnackbar({
        open: true,
        message: `${type === 'category' ? 'Category' : 'Item'} deleted successfully`,
        severity: 'success',
      });
      setDeleteDialog({ ...deleteDialog, open: false });
      fetchData();
    } catch (error) {
      console.error('Error deleting:', error);
      setSnackbar({
        open: true,
        message: 'Failed to delete',
        severity: 'error',
      });
    }
  };

  const handleAccordionChange =
    (categoryId: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
      setExpandedCategory(isExpanded ? categoryId : false);
    };

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Uses Management
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage the tools, apps, and gear displayed on your Uses page
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenCategoryDialog()}>
          Add Category
        </Button>
      </Box>

      {/* Categories */}
      <Card sx={{ p: 2 }}>
        {loading ? (
          <LoadingSkeleton />
        ) : categories.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Build sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No categories yet
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
              Create your first category to start adding items
            </Typography>
            <Button
              variant="outlined"
              startIcon={<Add />}
              onClick={() => handleOpenCategoryDialog()}
            >
              Add Category
            </Button>
          </Box>
        ) : (
          categories.map((category) => {
            const IconComponent = availableIcons[category.icon] || Build;
            return (
              <Accordion
                key={category.id}
                expanded={expandedCategory === category.id}
                onChange={handleAccordionChange(category.id)}
                sx={{ mb: 1 }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMore />}
                  sx={{
                    '& .MuiAccordionSummary-content': {
                      alignItems: 'center',
                      gap: 2,
                    },
                  }}
                >
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                      color: 'primary.main',
                      display: 'flex',
                    }}
                  >
                    <IconComponent sx={{ fontSize: 20 }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography fontWeight={600}>{category.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {category.items.length} item{category.items.length !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                  <Chip label={`Order: ${category.sort_order}`} size="small" variant="outlined" />
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenCategoryDialog(category);
                    }}
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteDialog({
                        open: true,
                        type: 'category',
                        id: category.id,
                        name: category.title,
                      });
                    }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      size="small"
                      startIcon={<Add />}
                      onClick={() => handleOpenItemDialog(category.id)}
                    >
                      Add Item
                    </Button>
                  </Box>
                  {category.items.length === 0 ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ textAlign: 'center', py: 2 }}
                    >
                      No items in this category
                    </Typography>
                  ) : (
                    <List disablePadding>
                      {category.items.map((item, index) => (
                        <Box key={item.id}>
                          {index > 0 && <Divider />}
                          <ListItem sx={{ px: 0 }}>
                            <DragIndicator sx={{ mr: 1, color: 'text.disabled', cursor: 'grab' }} />
                            <ListItemText
                              primary={item.name}
                              secondary={
                                <>
                                  {item.description}
                                  {item.url && (
                                    <Box
                                      component="a"
                                      href={item.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      sx={{
                                        display: 'block',
                                        fontSize: '0.75rem',
                                        color: 'primary.main',
                                        mt: 0.5,
                                      }}
                                    >
                                      {item.url}
                                    </Box>
                                  )}
                                </>
                              }
                              primaryTypographyProps={{ fontWeight: 500 }}
                            />
                            <ListItemSecondaryAction>
                              <IconButton
                                size="small"
                                onClick={() => handleOpenItemDialog(category.id, item)}
                              >
                                <Edit fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() =>
                                  setDeleteDialog({
                                    open: true,
                                    type: 'item',
                                    id: item.id,
                                    name: item.name,
                                  })
                                }
                              >
                                <Delete fontSize="small" />
                              </IconButton>
                            </ListItemSecondaryAction>
                          </ListItem>
                        </Box>
                      ))}
                    </List>
                  )}
                </AccordionDetails>
              </Accordion>
            );
          })
        )}
      </Card>

      {/* Category Dialog */}
      <Dialog
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Title"
            value={categoryForm.title}
            onChange={(e) => setCategoryForm({ ...categoryForm, title: e.target.value })}
            sx={{ mt: 2, mb: 2 }}
            required
          />
          <TextField
            fullWidth
            select
            label="Icon"
            value={categoryForm.icon}
            onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
            sx={{ mb: 2 }}
          >
            {iconOptions.map((icon) => {
              const IconComp = availableIcons[icon];
              return (
                <MenuItem key={icon} value={icon}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconComp fontSize="small" />
                    {icon}
                  </Box>
                </MenuItem>
              );
            })}
          </TextField>
          <TextField
            fullWidth
            type="number"
            label="Sort Order"
            value={categoryForm.sort_order}
            onChange={(e) =>
              setCategoryForm({
                ...categoryForm,
                sort_order: parseInt(e.target.value) || 0,
              })
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveCategory} disabled={!categoryForm.title}>
            {editingCategory ? 'Save Changes' : 'Create Category'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Item Dialog */}
      <Dialog
        open={itemDialogOpen}
        onClose={() => setItemDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingItem ? 'Edit Item' : 'Add Item'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Name"
            value={itemForm.name}
            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            sx={{ mt: 2, mb: 2 }}
            required
          />
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Description"
            value={itemForm.description}
            onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="URL (optional)"
            value={itemForm.url}
            onChange={(e) => setItemForm({ ...itemForm, url: e.target.value })}
            sx={{ mb: 2 }}
            helperText="Link to product page or affiliate link"
          />
          <TextField
            fullWidth
            select
            label="Category"
            value={itemForm.category_id}
            onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
            sx={{ mb: 2 }}
          >
            {categories.map((cat) => (
              <MenuItem key={cat.id} value={cat.id}>
                {cat.title}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            type="number"
            label="Sort Order"
            value={itemForm.sort_order}
            onChange={(e) =>
              setItemForm({
                ...itemForm,
                sort_order: parseInt(e.target.value) || 0,
              })
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveItem}
            disabled={!itemForm.name || !itemForm.category_id}
          >
            {editingItem ? 'Save Changes' : 'Add Item'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ ...deleteDialog, open: false })}
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &quot;{deleteDialog.name}&quot;?
            {deleteDialog.type === 'category' && (
              <Typography component="span" color="error" sx={{ display: 'block', mt: 1 }}>
                This will also delete all items in this category.
              </Typography>
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ ...deleteDialog, open: false })}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
