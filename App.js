import Camera_t from './PopEngine/Camera.js'
import AssetManager from './PopEngine/AssetManager.js'
import {CreateCubeGeometry,MergeGeometry} from './PopEngine/CommonGeometry.js'
import {TransformPosition,GetMatrixTransposed,MatrixInverse4x4,CreateTranslationMatrix,Add3,Multiply3,Dot3,lerp,Lerp,LengthSq3,Normalise3,Subtract3} from './PopEngine/Math.js'
import {CreateRandomImage} from './PopEngine/Images.js'
import {GetRandomColour} from './PopEngine/Colour.js'
import * as PopMath from './PopEngine/Math.js'
import Pop from './PopEngine/PopEngine.js'
import GetBlitPixelTestRenderCommands from './BlitPixelsTest.js'
import ParseMagicaVox from './PopEngine/MagicaVox.js'
import {JoinTypedArrays,SplitArrayIntoChunks} from './PopEngine/PopApi.js'
import {GetZeroFloatArray} from './PopEngine/PopApi.js'
import DirtyBuffer from './PopEngine/DirtyBuffer.js'
import VoxelBuffer_t from './VoxelBuffer.js'
import {CreateColourTexture} from './PopEngine/Images.js'
import OctreeNode from './PopEngine/Octree.js'
import PositionsToOctree from './PositionsToOctree.js'
import {LoadDepthkitDepthClouds} from './DepthCloud.js'


const NullTexture = CreateColourTexture([0,0,0,0]);

//	adreno (quest2) has a hardware optimised clear for 0,0,0 and 1,1,1
//	somehow this should be passed from XR api/camera (default clear?)
const ClearColour = ([40, 105, 133,255]).map( x => x/255 );


const FloorColour = [146, 166, 48,255].map(x=>(x/255));
const OriginColour = [255,60,60,255].map(x=>(x/255));
const RenderFloor = true;
const RenderOrigin = true;
const FloorSize = [1,0.001,1];
const OriginSize = [0.01,0.01,0.01];
const FloorOrigin = [0,0,0];

const RenderDebugQuads = true;	//	need to avoid in xr
const DebugQuadTilesx = 10;
const DebugQuadTilesy = 10;

const RenderOctree = true;


function GetAllBoundingBoxes(Octree)
{
	let Boxes = [];
	function OnNode(Box,LeafType)
	{
		if ( LeafType != 'Empty' )
			Boxes.push(Box);
	}
	Octree.EnumBoundingBoxes(OnNode);
	
	function AddSize(Box)
	{
		Box.Size = Subtract3( Box.Max, Box.Min );
	}
	Boxes.forEach( AddSize );
	return Boxes;
}

async function CreateCubeTriangleBuffer(RenderContext)
{
	const Geometry = CreateCubeGeometry(-1,1);
	const TriangleIndexes = undefined;
	const TriBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriBuffer;
}


async function CreateDebugQuadTriangleBuffer(RenderContext)
{
	const Geometry = CreateBlitGeometry();
	const TriangleIndexes = undefined;
	const TriangleBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriangleBuffer;
}
async function CreateUnitCubeTriangleBuffer(RenderContext)
{
	const Geometry = CreateCubeGeometry(0,1);
	const TriangleIndexes = undefined;
	const TriBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriBuffer;
}


function GetColourN(xyz,Index)
{
	if ( Index == 0 )
		return [0,1,0,1];
	let rgb = GetRandomColour();
	const r = lerp( 0.4, 0.9, Math.random() );
	const b = lerp( 0.4, 0.9, Math.random() );
	const g = lerp( 0.4, 0.9, Math.random() );
	const a = 1;
	//return [r,g,b,a];
	return [...rgb,a];
}

let DebugQuadShader;
let BoundingBoxShader = null;
let PlainColourShader = null;
let CubeShader = null;
let CubeMultiViewShader = null;
let CubePhysicsShader;
let CubePhysicsMultiViewShader;

let AppCamera = new Camera_t();
AppCamera.Position = [0,0.5,-10];
AppCamera.LookAt = [0,0.5,0];
AppCamera.FovVertical = 90;




function RenderBoundingBoxes(PushCommand,RenderContext,CameraUniforms,BoundingBoxes)
{
	if ( !BoundingBoxes.length )
		return;
		
	const Geo = AssetManager.GetAsset('UnitCube',RenderContext);
	const Shader = AssetManager.GetAsset(BoundingBoxShader,RenderContext);

	function BoundingBoxToLocalToWorld(BoundingBox)
	{
		//	get a scale and origin for cube 0..1
		let Translation = BoundingBox.Min;
		let Scale = BoundingBox.Size;
		const LocalToWorld = PopMath.CreateTranslationScaleMatrix(Translation,Scale);
		return LocalToWorld;
	}

	//	straight into a flat array is so much faster
	//const LocalToWorlds = BoundingBoxes.map( BoundingBoxToLocalToWorld );
	let BoundingBoxLocalToWorlds = [];
	BoundingBoxes.forEach( bb => BoundingBoxLocalToWorlds.push( ...BoundingBoxToLocalToWorld(bb) ) );

	//	to avoid allocating new zero arrays often as this number of bounding boxes changes so wildly
	//	do it in chunks so (ideally) it's 1 or 2 draw calls, one with only a small remainder
	const DrawCallSize = 100*1000;
	for ( let DrawCall=0;	DrawCall<Math.ceil(BoundingBoxLocalToWorlds.length/DrawCallSize);	DrawCall++ )
	{
		let LocalToWorlds = BoundingBoxLocalToWorlds.slice( DrawCall*DrawCallSize, (DrawCall+1)*DrawCallSize );
		if ( LocalToWorlds.length < DrawCallSize )
			LocalToWorlds.length = DrawCallSize;

		const Uniforms = Object.assign({},CameraUniforms);
		Uniforms.LocalToWorldTransform = LocalToWorlds;
		Uniforms.WorldVelocity = GetZeroFloatArray(3*LocalToWorlds.length);
		Uniforms.Colour = GetZeroFloatArray(4*LocalToWorlds.length);
		Uniforms.VelocityStretch = 0.0;
		
		const State = {};
		State.BlendMode = 'Blit';
		State.DepthWrite = true;
		State.DepthRead = true;
			
		const DrawCube = ['Draw',Geo,Shader,Uniforms,State];
		PushCommand( DrawCube );
	}
}

function RenderCubes(PushCommand,RenderContext,CameraUniforms,CubeTransforms,CubeVelocitys,OccupancyTexture,Colours)
{
	if ( !CubeTransforms.length )
		return;
	OccupancyTexture = OccupancyTexture || NullTexture;
		
	const Geo = AssetManager.GetAsset('Cube',RenderContext);
	const Shader = AssetManager.GetAsset( CameraUniforms.MultiView ? CubeMultiViewShader : CubeShader,RenderContext);

	const Uniforms = Object.assign({},CameraUniforms);
	Uniforms.LocalToWorldTransform = CubeTransforms;
	Uniforms.WorldVelocity = CubeVelocitys ? CubeVelocitys : GetZeroFloatArray(3*CubeTransforms.length);
	Uniforms.Colour = Colours.slice( 0, CubeTransforms.length*4 );
	
	Uniforms.OccupancyMapWorldMin = OccupancyMapSize.WorldMin;
	Uniforms.OccupancyMapWorldMax = OccupancyMapSize.WorldMax;
	Uniforms.OccupancyMapTexture = OccupancyTexture;
	Uniforms.OccupancyMapTextureSize = [OccupancyTexture.GetWidth(),OccupancyTexture.GetHeight()];
	
	Uniforms.TimeSecs = Pop.GetTimeNowMs()/1000;
	
	const State = {};
	State.BlendMode = 'Blit';
	//State.CullFacing = 'Back';
	//State.DepthRead = false;
		
	const DrawCube = ['Draw',Geo,Shader,Uniforms,State];
	PushCommand( DrawCube );
}

function RenderVoxelBufferCubes(PushCommand,RenderContext,CameraUniforms,VoxelsBuffer,OccupancyTexture)
{
	if ( !VoxelsBuffer )
		return;
	OccupancyTexture = OccupancyTexture || NullTexture;
		
	const Geo = AssetManager.GetAsset('Cube',RenderContext);
	const Shader = AssetManager.GetAsset(CameraUniforms.MultiView ? CubePhysicsMultiViewShader : CubePhysicsShader,RenderContext);

	const Uniforms = Object.assign({},CameraUniforms);
	Uniforms.LocalToWorldTransform = VoxelsBuffer.LocalToWorldTransform;
	Uniforms.Colour = VoxelsBuffer.Colours;

	let PositionsTexture = VoxelsBuffer.PositionsTexture;
	let VelocitysTexture = VoxelsBuffer.VelocitysTexture;
	//	temp texture happens to have the previous positions
	let PreviousPositionsTexture = VoxelsBuffer.PreviousPositionsTexture;

	Uniforms.PhysicsPreviousPositionsTexture = PreviousPositionsTexture;
	Uniforms.PhysicsPositionsTexture = PositionsTexture;
	Uniforms.PhysicsPositionsTextureSize = [PositionsTexture.GetWidth(),PositionsTexture.GetHeight()];
	Uniforms.PhysicsVelocitysTexture = VelocitysTexture;
	
	Uniforms.OccupancyMapWorldMin = OccupancyMapSize.WorldMin;
	Uniforms.OccupancyMapWorldMax = OccupancyMapSize.WorldMax;
	Uniforms.OccupancyMapTexture = OccupancyTexture;
	Uniforms.OccupancyMapTextureSize = [OccupancyTexture.GetWidth(),OccupancyTexture.GetHeight()];
	
	Uniforms.TimeSecs = Pop.GetTimeNowMs()/1000;
	Uniforms.ViewToCameraTransform = VoxelsBuffer.Camera.GetScreenToCameraTransform([0,0,1,1]);

	const State = {};
	State.BlendMode = 'Blit';
	//State.CullFacing = 'Back';
	//State.DepthRead = false;
		
	const DrawCube = ['Draw',Geo,Shader,Uniforms,State];
	PushCommand( DrawCube );
}

function RenderDebugQuad( PushCommand, RenderContext, DebugTexture, Index, DrawTransparent )
{
	const Geo = AssetManager.GetAsset('DebugQuad',RenderContext);
	const Shader = AssetManager.GetAsset(DebugQuadShader,RenderContext);

	const Width = 1/DebugQuadTilesx;
	const Height = 1/DebugQuadTilesy;
	let Left = Index % DebugQuadTilesx;
	let Top = Math.floor(Index/DebugQuadTilesx);
	
	const Uniforms = {};
	Uniforms.Rect = [Left,Top,Width,Height];
	Uniforms.Texture = DebugTexture;

	const State = {};
	State.BlendMode = DrawTransparent ? 'Alpha' : 'Blit';
	
	PushCommand(['Draw',Geo,Shader,Uniforms,State]);
}


export default class App_t
{
	constructor()
	{
		this.RegisterAssets();
		this.UserExitPromise = Pop.CreatePromise();
		
		this.VoxelBuffers = [];
		this.DepthClouds = [];
		this.Octree = null;
		this.WaitForRenderContextPromise = Pop.CreatePromise();
	}
	
	get Camera()	{	return AppCamera;	}
	
	async WaitForUserExit()
	{
		return this.UserExitPromise;
	}
	
	async WaitForRenderContext()
	{
		return this.WaitForRenderContextPromise;
	}
	
	RegisterAssets()
	{
		if ( CubeShader )
			return;
		AssetManager.RegisterAssetAsyncFetchFunction('Cube', CreateCubeTriangleBuffer );
		AssetManager.RegisterAssetAsyncFetchFunction('UnitCube', CreateUnitCubeTriangleBuffer );
		AssetManager.RegisterAssetAsyncFetchFunction('DebugQuad', CreateDebugQuadTriangleBuffer );

		const MultiViewMacros = {};
		MultiViewMacros.MULTI_VIEW = true;

		const TexturePositionMacros = {};
		TexturePositionMacros.POSITION_FROM_TEXTURE = 1;

		const TexturePositionAndMultiView = Object.assign( {}, MultiViewMacros, TexturePositionMacros );

		{
			const VertFilename = 'Geo.vert.glsl';
			const FragFilename = 'Colour.frag.glsl';
			CubeShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertFilename);
			CubeMultiViewShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertFilename,MultiViewMacros);
			const VertPhysicsFilename = VertFilename;
			CubePhysicsShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertPhysicsFilename,TexturePositionMacros);
			CubePhysicsMultiViewShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertPhysicsFilename,TexturePositionAndMultiView);
		}
		{
			const VertFilename = 'PlainGeo.vert.glsl';
			const FragFilename = 'PlainColour.frag.glsl';
			PlainColourShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertFilename);
		}
		
		{
			const VertFilename = 'PlainGeo.vert.glsl';
			const FragFilename = 'BoundingBox.frag.glsl';
			BoundingBoxShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertFilename);
		}
		DebugQuadShader = AssetManager.RegisterShaderAssetFilename('DebugQuad.frag.glsl','DebugQuad.vert.glsl');
	}
	
	BindXrControls(Device)
	{
		const ExitButtons = [5,'B','X','Y'];
		const DropButtons = [4,'A'];
		
		Device.OnMouseMove = function(xyz,Button,InputName,Transform,ExtraData)
		{
			//	false when not tracking
			if ( !Transform )
				return;
		}
		
		Device.OnMouseDown = function(xyz,Button,InputName,Transform)
		{
			//	if user presses a face button exit app
			if ( ExitButtons.includes(Button) )
				this.UserExitPromise.Resolve();

			//	update position as move isn't called when mouse is down
			Device.OnMouseMove( ...arguments );
		}.bind(this);

		Device.OnMouseUp = function(xyz,Button,InputName,Transform)
		{
		}
	}
	
	BindMouseCameraControls(RenderView)
	{
		const Camera = this.Camera;
		
		RenderView.OnMouseDown = function(x,y,Button,FirstDown=true)
		{
			if ( Button == 'Left' )
			{
			}
			
			if ( Button == 'Right' )
				Camera.OnCameraFirstPersonRotate( x, y, 0, FirstDown!=false );
			
			if ( Button == 'Middle' )
				Camera.OnCameraPanLocal( -x, y, 0, FirstDown!=false );
		}
		
		RenderView.OnMouseMove = function(x,y,Button)
		{
			RenderView.OnMouseDown( x, y, Button, false );
		}
		
		RenderView.OnMouseScroll = function(x,y,Button,Delta)
		{
			Camera.OnCameraPanLocal( x, y, 0, true );
			Camera.OnCameraPanLocal( x, y, -Delta[1] * 10.0, false );
			//Camera.OnCameraZoom( -Delta[1] * 0.1 );
		}
		
		RenderView.OnMouseUp = function(x,y,Button)
		{
		}
	}
	
	GetDesktopRenderCommands(RenderContext,RenderView)
	{
		//	update camera
		const Viewport = RenderView.GetScreenRect();
		
		return this.GetSceneRenderCommands( RenderContext, this.Camera, Viewport );
	}
	
	GetXrRenderCommands(RenderContext,Camera)
	{
		return this.GetSceneRenderCommands(...arguments);
	}
	
	GetSceneCameraUniforms(Camera,Viewport)
	{
		//	normalise viewport
		Viewport[0] = 0;
		Viewport[1] = 0;
		Viewport[3] /= Viewport[2];
		Viewport[2] /= Viewport[2];

		const CameraUniforms = {};
		CameraUniforms.WorldToCameraTransform = Camera.GetWorldToCameraMatrix();
		CameraUniforms.CameraToWorldTransform = Camera.GetLocalToWorldMatrix();
		CameraUniforms.CameraProjectionTransform = Camera.GetProjectionMatrix(Viewport);
		
		//	pass this data down to the GetDrawCommands() stuff
		if ( Camera.MultiView )
			CameraUniforms.MultiView = true;
		
		return CameraUniforms;
	}
	
	GetSceneRenderCommands(RenderContext,Camera,Viewport=[0,0,1,1])
	{
		this.RegisterAssets();
		
		const ClearCommand = ['SetRenderTarget',null,ClearColour];
		const CameraUniforms = this.GetSceneCameraUniforms(Camera,Viewport);

		const RenderCommands = [];
		function PushCommand(Command)
		{
			RenderCommands.push(Command);
		}

		for ( let VoxelBuffer of this.VoxelBuffers )
		{
			RenderVoxelBufferCubes( PushCommand, RenderContext, CameraUniforms, VoxelBuffer, null );
		}

		for ( let DepthCloud of this.DepthClouds )
		{
			DepthCloud.GetRenderCommands( PushCommand, RenderContext, CameraUniforms, AssetManager, BoundingBoxShader,PlainColourShader );
		}
		
		if ( RenderOctree )
		{
			const BoundingBoxes = this.DepthClouds.map( c => c.BoundingBox ).filter( bb => bb!=null );
			RenderBoundingBoxes( PushCommand, RenderContext, CameraUniforms, BoundingBoxes );
		}

		
		{
			//RenderVoxelBufferCubes( PushCommand, RenderContext, CameraUniforms, this.Game.VoxelBuffer, this.Game.OccupancyTexture );
		}
		
		//	floor cube
		if ( RenderFloor )
		{
			let Transform = PopMath.CreateTranslationScaleMatrix( FloorOrigin, FloorSize );
			const Geo = AssetManager.GetAsset('UnitCube',RenderContext);
			const Shader = AssetManager.GetAsset( PlainColourShader, RenderContext );

			const Uniforms = Object.assign({},CameraUniforms);
			Uniforms.LocalToWorldTransform = Transform;
			Uniforms.Colour = FloorColour;
			const State = {};
			State.BlendMode = 'Blit';
			const DrawCube = ['Draw',Geo,Shader,Uniforms,State];
			PushCommand( DrawCube );
		}
		if ( RenderOrigin )
		{
			let Position = Subtract3( FloorOrigin, Multiply3( OriginSize, 0.5 ) );
			let Transform = PopMath.CreateTranslationScaleMatrix( Position, OriginSize );
			const Geo = AssetManager.GetAsset('UnitCube',RenderContext);
			const Shader = AssetManager.GetAsset( PlainColourShader, RenderContext );

			const Uniforms = Object.assign({},CameraUniforms);
			Uniforms.LocalToWorldTransform = Transform;
			Uniforms.Colour = OriginColour;
			const State = {};
			State.BlendMode = 'Blit';
			const DrawCube = ['Draw',Geo,Shader,Uniforms,State];
			PushCommand( DrawCube );
		}
		
		//	dont do this in xr
		if ( RenderDebugQuads )
		{
			const DebugTextures = [];
			if ( this.VoxelBuffer )
			{
				DebugTextures.push( this.VoxelBuffer.PositionsTexture );
			}

			function Render(DebugTexture,Index)
			{
				const DrawTransparent = false;
				RenderDebugQuad( PushCommand, RenderContext, DebugTexture, Index, DrawTransparent );
			}
			DebugTextures.forEach( Render );
		}

		if ( this.Octree && RenderOctree )
		{
			//const BoundingBoxes = GetBoundingBoxesFromOccupancy(this.Game.OccupancyTexture);
			const BoundingBoxes = GetAllBoundingBoxes(this.Octree);
			RenderBoundingBoxes( PushCommand, RenderContext, CameraUniforms, BoundingBoxes );
		}

		return [ClearCommand,...RenderCommands];
	}
	
	Tick(TimestepSecs)
	{
	}
	
	async GpuTick(RenderContext,TimestepSecs)
	{
		this.WaitForRenderContextPromise.Resolve(RenderContext);
	}
	
	async GameIteration()
	{
		await this.LoadDepthCloudThread(`Models/Scientist/Scientist.jpg`,`Models/Scientist/TAKE_03_03_10_24_58_Export_03_14_08_40_09.txt`);
		//await this.GenerateSdfThread(`Models/Taxi.vox`);
		//await this.GenerateSdfThread(`Models/lego/test/r_0`);
		//await this.GenerateSdfThread(`Models/lego/test/r_25`);
		//await this.GenerateSdfThread(`Models/lego/test/r_146`);
	}
	
	async LoadDepthCloudThread(ImageFilename,MetaFilename)
	{
		const Meta = await Pop.FileSystem.LoadFileAsJsonAsync(MetaFilename);
		const Image = await Pop.FileSystem.LoadFileAsImageAsync(ImageFilename);
		const DepthClouds = await LoadDepthkitDepthClouds(Meta,Image);
		this.DepthClouds.push(...DepthClouds);
	}
	
	//	this is a pipeline, this is the bit which we should abstract
	async GenerateSdfThread(Filename)
	{
		const VoxelBuffer = await this.LoadVoxelBuffer(Filename);
		this.VoxelBuffers.push(VoxelBuffer);
		this.Octree = await this.GenerateOctreeFromVoxelBuffer(VoxelBuffer);
	}
	
	async GenerateOctreeFromVoxelBuffer(VoxelBuffer)
	{
		const PositionsImage = VoxelBuffer.PositionsTexture;
		//	future plan for depthtexture -> world
		const PositionToWorldTransform = CreateTranslationMatrix(0,0,0);
		return await this.GenerateOctreeFromPositions( PositionsImage, PositionToWorldTransform );
	}

	async GenerateOctreeFromPositions(PositionsImage,PositionToWorldTransform)
	{
		/*
		const BoundingBox =
		{
		Min:OccupancyMapSize.WorldMin,
		Max:OccupancyMapSize.WorldMax,
		};
		const Octree = new OctreeNode( null, BoundingBox );
		*/
		const RenderContext = await this.WaitForRenderContext();
		const Octree = await PositionsToOctree(PositionsImage,PositionToWorldTransform,RenderContext);
		
		return Octree;
	}

	async LoadVoxelBuffer(Filename)
	{
		const VoxelBuffer = new VoxelBuffer_t();
		VoxelBuffer.LocalToWorldTransform = CreateTranslationMatrix(0,0,0);

		if ( Filename.endsWith('.vox') )
		{
			await this.LoadVoxelBufferVox(Filename,VoxelBuffer);
		}
		else
		{
			await this.LoadVoxelBufferDepthAndColour(Filename,VoxelBuffer);
		}
		return VoxelBuffer;
	}

	async LoadVoxelBufferDepthAndColour(BaseFilename,VoxelBuffer)
	{
		//	assume its the dpeth+colour dataset
		const ColourFilename = `${BaseFilename}.png`;
		const DepthFilename = `${BaseFilename}_depth_0001.png`;
		const MetaFilename = `Models/Lego/transforms_test.json`;
		let AllMeta = await Pop.FileSystem.LoadFileAsStringAsync(MetaFilename);
		AllMeta = JSON.parse(AllMeta);
		AllMeta.frames.forEach( f => f.file_path = f.file_path.split('./').join('') );

		//const Meta = AllMeta.frames.find( f => f.file_path == BaseFilename );
		const Metas = AllMeta.frames.filter( f => BaseFilename.endsWith(f.file_path) );
		if ( Metas.length != 1 )
			throw `Meta not found`;
		
		//	freom readme
		//	https://github.com/bmild/nerf
		//	camera_angle_x: The FOV in x dimension
		//	frames: List of dictionaries that contain the camera transform matrices for each image.
		//	https://github.com/bmild/nerf/blob/20a91e764a28816ee2234fcadb73bd59a613a44c/load_blender.py
		//	need to calc projection matrix!
		//	 H, W = imgs[0].shape[:2]
		//	camera_angle_x = float(meta['camera_angle_x'])
		//	focal = .5 * W / np.tan(.5 * camera_angle_x)
		//	render_poses = tf.stack([pose_spherical(angle, -30.0, 4.0) for angle in np.linspace(-180,180,40+1)[:-1]],0)
		//def pose_spherical(theta, phi, radius):
		//	c2w = trans_t(radius)
		//	c2w = rot_phi(phi/180.*np.pi) @ c2w
		//	c2w = rot_theta(theta/180.*np.pi) @ c2w
		//	c2w = np.array([[-1,0,0,0],[0,0,1,0],[0,1,0,0],[0,0,0,1]]) @ c2w
		//	return
		//near = 2.
		// far = 6.
		//const NearZ = 2;
		//const FarZ = 6;
		//	referenced as c2w, camera to world
		VoxelBuffer.LocalToWorldTransform = Metas[0].transform_matrix.flat(2);
		VoxelBuffer.LocalToWorldTransform = GetMatrixTransposed(VoxelBuffer.LocalToWorldTransform);
		//VoxelBuffer.LocalToWorldTransform = MatrixInverse4x4(VoxelBuffer.LocalToWorldTransform);

		VoxelBuffer.Camera = new Camera_t();
		//	this is horz! but 800x800
		VoxelBuffer.Camera.FovVertical = PopMath.RadToDeg(AllMeta.camera_angle_x);
		VoxelBuffer.Camera.NearDistance = 0.01;
		VoxelBuffer.Camera.FarDistance = 10;

		const ColourImage = await Pop.FileSystem.LoadFileAsImageAsync(ColourFilename);
		let ColourPixels = Array.from(ColourImage.GetPixelBuffer());
		ColourPixels = ColourPixels.map( x => x/255 );
		let Colours = SplitArrayIntoChunks( ColourPixels, ColourImage.GetChannels() );
		
		const DepthImage = await Pop.FileSystem.LoadFileAsImageAsync(DepthFilename);
		let Depths = DepthImage.GetPixelBuffer();
		Depths = SplitArrayIntoChunks( Depths, DepthImage.GetChannels() );
		
		const Width = DepthImage.GetWidth();
		const Height = DepthImage.GetHeight();
		
		function DepthRgbaToPosition(rgba,PixelIndex)
		{
			if ( rgba[3] == 0 )
				return null;
			let x = PixelIndex % Width;
			let y = Math.floor( PixelIndex / Width );
			x /= Width;
			y /= Height;
			let z = rgba[0]/255;
			//	xyz is 0...1 convert to -1..1
			x = Lerp( -1, 1, x );
			y = Lerp( -1, 1, y );
			z = Lerp( 2, 6, z );
			//z = 0.25;
			
			
			//y = 1-y;
			//z *= 50;
			//x *= CubeSize*2;
			//y *= CubeSize*2;
			return [x,y,z];
		}
		let Positions = Depths.map( DepthRgbaToPosition );
		
		//	remove invalid entries from both arrays
		Colours = Colours.filter( (c,i) => Positions[i]!=null );
		Positions = Positions.filter( (p,i) => Positions[i]!=null );
		
		//Colours = Colours.flat(2);
		//Positions = Positions.flat(2);

		VoxelBuffer.LoadPositions( Positions, Colours, [0,0,0] );
	}
	
	async LoadVoxelBufferVox(Filename,VoxelBuffer)
	{
		const VoxContents = await Pop.FileSystem.LoadFileAsArrayBufferAsync(Filename);
		
		const MergedGeometry = {};
		function OnGeometry(Geometry)
		{
			for ( let Attrib in Geometry )
			{
				let Data = MergedGeometry[Attrib] || [];
				Data = Data.concat( Geometry[Attrib] );
				MergedGeometry[Attrib] = Data;
			}
		}
		await ParseMagicaVox( VoxContents, OnGeometry );
		const Geometry = MergedGeometry;
		
		const SkipEveryX = 0;
		
		function TweakPosition(xyz,Index)
		{
			if ( SkipEveryX!=0 && Index % SkipEveryX == 0 )
				return null;
			let Scale = 2;
			Scale = [CubeSize*Scale,CubeSize*Scale,CubeSize*Scale];
			
			xyz = Multiply3( xyz, Scale );
			xyz = Add3( xyz, VoxelCenterPosition );
			return xyz;
		}
		
		function TweakColour(rgba,Index)
		{
			if ( SkipEveryX!=0 && Index % SkipEveryX == 0 )
				return null;
			let ToneChange = (Math.random()-0.5)*0.05;
			rgba[0] += ToneChange;
			rgba[1] += ToneChange;
			rgba[2] += ToneChange;
			return rgba;
		}
		Geometry.Colours = Geometry.Colours.map(TweakColour).filter( x=>x != null );
		Geometry.Positions = Geometry.Positions.map(TweakPosition).filter( x=>x != null );
		
		Geometry.Colours = new Float32Array(Geometry.Colours.flat(2));
		
		VoxelBuffer.LoadPositions( Geometry.Positions, Geometry.Colours, VoxelCenterPosition, 0.0 );
	}
}
