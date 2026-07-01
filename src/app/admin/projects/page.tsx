'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Skeleton,
  Alert,
  Snackbar,
  alpha,
  Switch,
  FormControlLabel,
} from '@mui/material';
import type { DragEvent as ReactDragEvent } from 'react';
import {
  Add,
  DragIndicator,
  Search,
  Edit,
  Delete,
  MoreVert,
  Visibility,
  VisibilityOff,
  Star,
  StarBorder,
  GitHub,
  Launch,
  FolderOpen,
} from '@mui/icons-material';
import { SafeImage } from '@/components/common';
import { MediaBrowser } from '@/components';

// Project interface
interface Project {
  id: string;
  title: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  githubUrl: string | null;
  liveUrl: string | null;
  isFeatured: boolean;
  isPrivate: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  technologies: string[];
}

interface ProjectsResponse {
  projects: Project[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function LoadingSkeleton() {
  return (
    <TableBody>
      {[1, 2, 3, 4, 5].map((i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton width="80%" />
          </TableCell>
          <TableCell>
            <Skeleton width={80} />
          </TableCell>
          <TableCell>
            <Skeleton width={60} />
          </TableCell>
          <TableCell>
            <Skeleton width={60} />
          </TableCell>
          <TableCell>
            <Skeleton width={40} />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

function normalizeProjectOrder(projects: Project[]): Project[] {
  return projects
    .slice()
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.title.localeCompare(right.title);
    })
    .map((project, index) => ({
      ...project,
      sortOrder: index,
    }));
}

export default function ProjectsListPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [totalProjects, setTotalProjects] = useState(0);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [imageBrowserOpen, setImageBrowserOpen] = useState(false);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [isImageDropActive, setIsImageDropActive] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  });

  // Form state
  const [projectForm, setProjectForm] = useState({
    title: '',
    slug: '',
    description: '',
    imageUrl: '',
    githubUrl: '',
    liveUrl: '',
    isFeatured: false,
    isPrivate: false,
    technologies: '',
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '1000',
        ...(debouncedSearch && { search: debouncedSearch }),
      });

      const response = await fetch(`/api/admin/projects?${params}`);
      if (!response.ok) throw new Error('Failed to fetch projects');

      const data: ProjectsResponse = await response.json();
      setProjects(normalizeProjectOrder(data.projects));
      setTotalProjects(data.pagination.total);
    } catch (error) {
      console.error('Error fetching projects:', error);
      setSnackbar({
        open: true,
        message: 'Failed to load projects',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, project: Project) => {
    setAnchorEl(event.currentTarget);
    setSelectedProject(project);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedProject(null);
  };

  const handleOpenProjectDialog = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setProjectForm({
        title: project.title,
        slug: project.slug,
        description: project.description,
        imageUrl: project.imageUrl || '',
        githubUrl: project.githubUrl || '',
        liveUrl: project.liveUrl || '',
        isFeatured: project.isFeatured,
        isPrivate: project.isPrivate,
        technologies: project.technologies.join(', '),
      });
    } else {
      setEditingProject(null);
      setProjectForm({
        title: '',
        slug: '',
        description: '',
        imageUrl: '',
        githubUrl: '',
        liveUrl: '',
        isFeatured: false,
        isPrivate: false,
        technologies: '',
      });
    }
    setProjectDialogOpen(true);
    handleMenuClose();
  };

  const handleSaveProject = async () => {
    try {
      const url = editingProject
        ? `/api/admin/projects/${editingProject.id}`
        : '/api/admin/projects';
      const method = editingProject ? 'PUT' : 'POST';

      const payload = {
        ...projectForm,
        technologies: projectForm.technologies
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t),
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save project');
      }

      setSnackbar({
        open: true,
        message: `Project ${editingProject ? 'updated' : 'created'} successfully`,
        severity: 'success',
      });
      setProjectDialogOpen(false);
      fetchProjects();
    } catch (error) {
      console.error('Error saving project:', error);
      setSnackbar({
        open: true,
        message: error instanceof Error ? error.message : 'Failed to save project',
        severity: 'error',
      });
    }
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedProject) return;

    try {
      const response = await fetch(`/api/admin/projects/${selectedProject.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete project');

      setSnackbar({
        open: true,
        message: 'Project deleted successfully',
        severity: 'success',
      });
      setDeleteDialogOpen(false);
      handleMenuClose();
      fetchProjects();
    } catch (error) {
      console.error('Error deleting project:', error);
      setSnackbar({
        open: true,
        message: 'Failed to delete project',
        severity: 'error',
      });
    }
  };

  const handleToggleFeatured = async (project: Project) => {
    try {
      const response = await fetch(`/api/admin/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFeatured: !project.isFeatured }),
      });

      if (!response.ok) throw new Error('Failed to update project');

      fetchProjects();
    } catch (error) {
      console.error('Error toggling featured:', error);
    }
  };

  const handleTogglePrivate = async (project: Project) => {
    try {
      const response = await fetch(`/api/admin/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrivate: !project.isPrivate }),
      });

      if (!response.ok) throw new Error('Failed to update project');

      fetchProjects();
    } catch (error) {
      console.error('Error toggling private:', error);
    }
  };

  const syncProjectOrder = async (nextProjects: Project[]) => {
    const orderedProjects = nextProjects.map((project, index) => ({
      ...project,
      sortOrder: index,
    }));
    setProjects(orderedProjects);
    setIsReordering(true);

    try {
      const response = await fetch('/api/admin/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: orderedProjects.map((project) => project.id) }),
      });

      if (!response.ok) {
        throw new Error('Failed to reorder projects');
      }

      await fetchProjects();
    } catch (error) {
      console.error('Error reordering projects:', error);
      setSnackbar({
        open: true,
        message: 'Failed to save project order',
        severity: 'error',
      });
      await fetchProjects();
    } finally {
      setIsReordering(false);
    }
  };

  const handleDragStart = (event: ReactDragEvent<HTMLTableRowElement>, projectId: string) => {
    event.dataTransfer.setData('text/plain', projectId);
    event.dataTransfer.effectAllowed = 'move';
    setDraggedProjectId(projectId);
  };

  const handleDragOver = (event: ReactDragEvent<HTMLTableRowElement>) => {
    event.preventDefault();
  };

  const handleDrop = async (targetProjectId: string) => {
    if (!draggedProjectId || draggedProjectId === targetProjectId) {
      setDraggedProjectId(null);
      return;
    }

    const nextProjects = projects.slice();
    const draggedIndex = nextProjects.findIndex((project) => project.id === draggedProjectId);
    const targetIndex = nextProjects.findIndex((project) => project.id === targetProjectId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedProjectId(null);
      return;
    }

    const [draggedProject] = nextProjects.splice(draggedIndex, 1);
    nextProjects.splice(targetIndex, 0, draggedProject);

    setDraggedProjectId(null);
    await syncProjectOrder(nextProjects);
  };

  const uploadProjectImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setSnackbar({
        open: true,
        message: 'Please drop an image file',
        severity: 'error',
      });
      return;
    }

    setIsImageUploading(true);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('altText', `${projectForm.title || 'Project'} image`);

      const uploadResponse = await fetch('/api/admin/media', {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        const data = (await uploadResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Failed to upload image');
      }

      const mediaAsset = (await uploadResponse.json()) as { publicUrl?: string | null };
      setProjectForm((prev) => ({ ...prev, imageUrl: mediaAsset.publicUrl || '' }));
      setSnackbar({
        open: true,
        message: 'Image uploaded successfully',
        severity: 'success',
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: error instanceof Error ? error.message : 'Failed to upload image',
        severity: 'error',
      });
    } finally {
      setIsImageUploading(false);
    }
  };

  const handleImageDrop = async (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsImageDropActive(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    await uploadProjectImage(file);
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
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
            Projects
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage your portfolio projects
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenProjectDialog()}>
          New Project
        </Button>
      </Box>

      {/* Table Card */}
      <Card>
        {/* Search Bar */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            placeholder="Search projects..."
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search color="action" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ width: 300 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {totalProjects} total projects. Drag rows to reorder.
          </Typography>
        </Box>

        {/* Table */}
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Project</TableCell>
                <TableCell>Technologies</TableCell>
                <TableCell align="center">Links</TableCell>
                <TableCell align="center">Featured</TableCell>
                <TableCell align="center">Visibility</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>

            {loading ? (
              <LoadingSkeleton />
            ) : projects.length === 0 ? (
              <TableBody>
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        width: '100%',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <FolderOpen sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                      <Typography variant="h6" color="text.secondary">
                        No projects found
                      </Typography>
                      <Typography variant="body2" color="text.disabled">
                        {search ? 'Try a different search term' : 'Create your first project'}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              </TableBody>
            ) : (
              <TableBody>
                {projects.map((project) => (
                  <TableRow
                    key={project.id}
                    hover
                    draggable
                    onDragStart={(event) => handleDragStart(event, project.id)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(project.id)}
                    sx={{
                      '&:hover': {
                        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
                      },
                      opacity: draggedProjectId === project.id ? 0.5 : 1,
                      cursor: 'grab',
                    }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            color: 'text.disabled',
                            userSelect: 'none',
                          }}
                        >
                          <DragIndicator fontSize="small" />
                        </Box>
                        {project.imageUrl && (
                          <SafeImage
                            src={project.imageUrl}
                            alt={project.title}
                            fallbackText={project.title.charAt(0)}
                            width={48}
                            height={48}
                            objectFit="cover"
                            sx={{ borderRadius: 2 }}
                          />
                        )}
                        <Box>
                          <Typography fontWeight="medium">{project.title}</Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: '-webkit-box',
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {project.description}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {project.technologies.slice(0, 3).map((tech, i) => (
                          <Chip key={i} label={tech} size="small" variant="outlined" />
                        ))}
                        {project.technologies.length > 3 && (
                          <Chip
                            label={`+${project.technologies.length - 3}`}
                            size="small"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                        {project.githubUrl && (
                          <IconButton
                            size="small"
                            href={project.githubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <GitHub fontSize="small" />
                          </IconButton>
                        )}
                        {project.liveUrl && (
                          <IconButton
                            size="small"
                            href={project.liveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Launch fontSize="small" />
                          </IconButton>
                        )}
                        {!project.githubUrl && !project.liveUrl && (
                          <Typography variant="caption" color="text.disabled">
                            -
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        onClick={() => handleToggleFeatured(project)}
                        color={project.isFeatured ? 'warning' : 'default'}
                      >
                        {project.isFeatured ? <Star /> : <StarBorder />}
                      </IconButton>
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        onClick={() => handleTogglePrivate(project)}
                        color={project.isPrivate ? 'error' : 'success'}
                      >
                        {project.isPrivate ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={(e) => handleMenuOpen(e, project)}>
                        <MoreVert />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </TableContainer>
      </Card>

      {/* Actions Menu */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        <MenuItem onClick={() => handleOpenProjectDialog(selectedProject!)}>
          <Edit sx={{ mr: 1 }} fontSize="small" />
          Edit
        </MenuItem>
        {selectedProject?.liveUrl && (
          <MenuItem
            component="a"
            href={selectedProject.liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleMenuClose}
          >
            <Launch sx={{ mr: 1 }} fontSize="small" />
            View Live
          </MenuItem>
        )}
        <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
          <Delete sx={{ mr: 1 }} fontSize="small" />
          Delete
        </MenuItem>
      </Menu>

      {/* Project Dialog */}
      <Dialog
        open={projectDialogOpen}
        onClose={() => setProjectDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{editingProject ? 'Edit Project' : 'New Project'}</DialogTitle>
        <DialogContent>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 2,
              mt: 2,
            }}
          >
            <TextField
              fullWidth
              label="Title"
              value={projectForm.title}
              onChange={(e) => {
                const title = e.target.value;
                setProjectForm({
                  ...projectForm,
                  title,
                  slug: !editingProject ? generateSlug(title) : projectForm.slug,
                });
              }}
              required
            />
            <TextField
              fullWidth
              label="Slug"
              value={projectForm.slug}
              onChange={(e) => setProjectForm({ ...projectForm, slug: e.target.value })}
              required
              helperText="URL-friendly identifier"
            />
          </Box>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Description"
            value={projectForm.description}
            onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
            required
            sx={{ mt: 2 }}
          />
          {/* Project Image */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Project Image
            </Typography>
            {projectForm.imageUrl ? (
              <Box>
                <Box
                  component="img"
                  src={projectForm.imageUrl}
                  alt="Project image"
                  sx={{
                    width: '100%',
                    maxHeight: 200,
                    objectFit: 'cover',
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                  }}
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setImageBrowserOpen(true)}
                    fullWidth
                  >
                    Change Image
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={() => setProjectForm({ ...projectForm, imageUrl: '' })}
                  >
                    Remove
                  </Button>
                </Box>
                <Box
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsImageDropActive(true);
                  }}
                  onDragLeave={() => setIsImageDropActive(false)}
                  onDrop={handleImageDrop}
                  sx={{
                    mt: 1,
                    border: 2,
                    borderStyle: 'dashed',
                    borderColor: isImageDropActive ? 'primary.main' : 'divider',
                    borderRadius: 1,
                    p: 1.5,
                    textAlign: 'center',
                    bgcolor: isImageDropActive ? 'action.hover' : 'transparent',
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {isImageUploading ? 'Uploading image...' : 'Or drop an image here to replace'}
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Box
                onClick={() => setImageBrowserOpen(true)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsImageDropActive(true);
                }}
                onDragLeave={() => setIsImageDropActive(false)}
                onDrop={handleImageDrop}
                sx={{
                  border: 2,
                  borderStyle: 'dashed',
                  borderColor: isImageDropActive ? 'primary.main' : 'divider',
                  borderRadius: 1,
                  p: 3,
                  textAlign: 'center',
                  cursor: 'pointer',
                  bgcolor: isImageDropActive ? 'action.hover' : 'transparent',
                  '&:hover': { borderColor: 'primary.main' },
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  {isImageUploading
                    ? 'Uploading image...'
                    : 'Click to browse media, or drop an image here to upload'}
                </Typography>
              </Box>
            )}
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 2,
              mt: 2,
            }}
          >
            <TextField
              fullWidth
              label="GitHub URL"
              value={projectForm.githubUrl}
              onChange={(e) => setProjectForm({ ...projectForm, githubUrl: e.target.value })}
            />
            <TextField
              fullWidth
              label="Live URL"
              value={projectForm.liveUrl}
              onChange={(e) => setProjectForm({ ...projectForm, liveUrl: e.target.value })}
            />
          </Box>
          <TextField
            fullWidth
            label="Technologies (comma-separated)"
            value={projectForm.technologies}
            onChange={(e) => setProjectForm({ ...projectForm, technologies: e.target.value })}
            sx={{ mt: 2 }}
            helperText="e.g., React, TypeScript, Node.js"
          />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 2,
              mt: 2,
              alignItems: 'center',
            }}
          >
            <FormControlLabel
              control={
                <Switch
                  checked={projectForm.isFeatured}
                  onChange={(e) =>
                    setProjectForm({
                      ...projectForm,
                      isFeatured: e.target.checked,
                    })
                  }
                />
              }
              label="Featured"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={projectForm.isPrivate}
                  onChange={(e) =>
                    setProjectForm({
                      ...projectForm,
                      isPrivate: e.target.checked,
                    })
                  }
                />
              }
              label="Private"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProjectDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveProject}
            disabled={!projectForm.title || !projectForm.slug || !projectForm.description}
          >
            {editingProject ? 'Save Changes' : 'Create Project'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &quot;{selectedProject?.title}&quot;? This action cannot
            be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>
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

      {/* Media Browser for Project Image */}
      <MediaBrowser
        open={imageBrowserOpen}
        onClose={() => setImageBrowserOpen(false)}
        onSelect={(asset) =>
          setProjectForm((prev) => ({ ...prev, imageUrl: asset.publicUrl || '' }))
        }
        selectedUrl={projectForm.imageUrl || null}
        acceptedTypes="images"
      />

      {isReordering && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Saving project order...
        </Typography>
      )}
    </Box>
  );
}
