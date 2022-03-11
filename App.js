import Camera_t from './PopEngine/Camera.js'
import AssetManager from './PopEngine/AssetManager.js'
import {CreateCubeGeometry,MergeGeometry} from './PopEngine/CommonGeometry.js'
import {CreateTranslationMatrix,Add3,Multiply3,Dot3,lerp,Lerp,LengthSq3,Normalise3,Subtract3} from './PopEngine/Math.js'
import {CreateRandomImage} from './PopEngine/Images.js'
import {GetRandomColour} from './PopEngine/Colour.js'
import * as PopMath from './PopEngine/Math.js'
import Pop from './PopEngine/PopEngine.js'
import GetBlitPixelTestRenderCommands from './BlitPixelsTest.js'
import ParseMagicaVox from './PopEngine/MagicaVox.js'
import {JoinTypedArrays} from './PopEngine/PopApi.js'
import {GetZeroFloatArray} from './PopEngine/PopApi.js'
import DirtyBuffer from './PopEngine/DirtyBuffer.js'
import VoxelBuffer_t from './VoxelBuffer.js'
import {CreateColourTexture} from './PopEngine/Images.js'
import OctreeNode from './PopEngine/Octree.js'
import PositionsToOctree from './PositionsToOctree.js'

const NullTexture = CreateColourTexture([0,0,0,0]);

//	adreno (quest2) has a hardware optimised clear for 0,0,0 and 1,1,1
//	somehow this should be passed from XR api/camera (default clear?)
const ClearColour = ([86, 201, 209,255]).map( x => x/255 );


const FloorColour = [24, 64, 196,255].map(x=>(x/255));
//const FloorColour = [0.1,0.3,0.4,1.0];
const RenderFloor = true;
const FloorSize = 300;//800

const RenderDebugQuads = true;	//	need to avoid in xr
const DebugQuadTilesx = 10;
const DebugQuadTilesy = 10;

const RenderOctree = false;
const ReadBackOccupancyTexture = RenderOctree;
const GenerateOccupancyTexture = true;

const OccupancyTextureWidth = 128;
const OccupancyTextureHeight = 128;
const OccupancyMapSize = 
{
	WorldMin:[-7,-0.06,0],
	WorldMax:[4,1.80,-6],
};

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
	const Geometry = CreateCubeGeometry(-CubeSize,CubeSize);
	const TriangleIndexes = undefined;
	const TriBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriBuffer;
}


async function CreateUnitCubeTriangleBuffer(RenderContext)
{
	const Geometry = CreateCubeGeometry(0,1);
	const TriangleIndexes = undefined;
	const TriBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriBuffer;
}


function CreateBlitGeometry()
{
	let l = 0;
	let t = 0;
	let r = 1;
	let b = 1;
	const VertexData = [	l,t,	r,t,	r,b,	r,b, l,b, l,t	];
	
	const TexCoord = {};
	TexCoord.Size = 2;
	TexCoord.Data = VertexData;

	const Geometry = {};
	Geometry.TexCoord = TexCoord;
	return Geometry;
}

async function CreateBlitTriangleBuffer(RenderContext)
{
	const Geometry = CreateBlitGeometry();
	const TriangleIndexes = undefined;
	const TriangleBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriangleBuffer;
}

async function CreateDebugQuadTriangleBuffer(RenderContext)
{
	const Geometry = CreateBlitGeometry();
	const TriangleIndexes = undefined;
	const TriangleBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriangleBuffer;
}


let DebugQuadShader;
let BlitCopyShader;
let BlitUpdatePositionsShader;
let BlitUpdateVelocitysShader;
let BlitUpdateVelocitysAndPositionsShader;

function GetRenderCommandsUpdatePhysicsTextures(RenderContext,VoxelBuffer,Projectiles,OccupancyTexture)
{
	if ( !VoxelBuffer.PositionTexture )
		return [];
	const PositionTexture = VoxelBuffer.PositionsTexture;
	const PreviousPositionsTexture = VoxelBuffer.PreviousPositionsTexture;
	const VelocitysTexture = VoxelBuffer.VelocitysTexture;
	const PreviousVelocitysTexture = VoxelBuffer.PreviousVelocitysTexture;
	const ShapePositionsTexture = VoxelBuffer.ShapePositionsTexture;
	
	const Commands = [];
	
	const BlitGeo = AssetManager.GetAsset('BlitQuad',RenderContext);
	const State = {};
	State.BlendMode = 'Blit';
	
	let TexelSize = [1.0 / PositionTexture.GetWidth(),1.0 / PositionTexture.GetHeight()];
	
	//	copy old velocities
	{
		const CopyShader = AssetManager.GetAsset(BlitCopyShader,RenderContext);
		const Uniforms = {};
		Uniforms.SourceTexture = VelocitysTexture;
		Commands.push(['SetRenderTarget',PreviousVelocitysTexture]);
		Commands.push(['Draw',BlitGeo,CopyShader,Uniforms,State]);
	}

	//	copy old positions
	{
		const CopyShader = AssetManager.GetAsset(BlitCopyShader,RenderContext);
		const Uniforms = {};
		Uniforms.SourceTexture = PositionTexture;
		Commands.push(['SetRenderTarget',PreviousPositionsTexture]);
		Commands.push(['Draw',BlitGeo,CopyShader,Uniforms,State]);
	}
	
	//	quest doesn't support MRT
	const UseMrt = false;
	
	
	//	update velocitys texture
	{
		//	get projectile data
		//	todo: sort to significant projectiles within bounds
		function CompareProjectiles(a,b)
		{
			//	temp use nearest to 0,0,0 (use spawn time?)
			let Distancea = PopMath.Length3(a.Position);
			let Distanceb = PopMath.Length3(b.Position);
			if ( Distancea < Distanceb )	return -1;
			if ( Distancea > Distanceb )	return 1;
			return 0;
		}
		const UsefulProjectiles = Projectiles.slice().sort(CompareProjectiles);
		
		function GetProjectilePos(xxx,Index)
		{
			if ( Index >= UsefulProjectiles.length )
				return [0,0,0,0];
			const Projectile = UsefulProjectiles[Index];
			return [...Projectile.Position,1];
		}
		function GetProjectilePrevPos(xxx,Index)
		{
			if ( Index >= UsefulProjectiles.length )
				return [0,0,0,0];
			const Projectile = UsefulProjectiles[Index];
			return [...Projectile.PrevPosition,1];
		}
		const MAX_PROJECTILES = 100;
		let ProjectilePrevPos = new Array(MAX_PROJECTILES).fill(0).map( GetProjectilePrevPos );
		let ProjectileNextPos = new Array(MAX_PROJECTILES).fill(0).map( GetProjectilePos );
	
		const UpdateVelocitysShader = AssetManager.GetAsset(BlitUpdateVelocitysShader,RenderContext);
		const UpdateVelocitysAndPositionsShader = AssetManager.GetAsset(BlitUpdateVelocitysAndPositionsShader,RenderContext);
		const Uniforms = {};
		Uniforms.ShapePositionsTexture = ShapePositionsTexture;
		Uniforms.PreviousPositionsTexture = PreviousPositionsTexture;
		Uniforms.PreviousVelocitysTexture = PreviousVelocitysTexture;
		Uniforms.PositionsTexture = PositionTexture;
		Uniforms.ProjectilePrevPos = ProjectilePrevPos;
		Uniforms.ProjectileNextPos = ProjectileNextPos;
		Uniforms.TexelSize = TexelSize;
		Uniforms.CubeSize = CubeSize;
		Uniforms.Random4 = [Math.random(),Math.random(),Math.random(),Math.random()];
		
		Uniforms.OccupancyMapWorldMin = OccupancyMapSize.WorldMin;
		Uniforms.OccupancyMapWorldMax = OccupancyMapSize.WorldMax;
		Uniforms.OccupancyMapTexture = OccupancyTexture;
		Uniforms.OccupancyMapTextureSize = [OccupancyTexture.GetWidth(),OccupancyTexture.GetHeight()];

		if ( UseMrt )
		{
			Commands.push(['SetRenderTarget',[VelocitysTexture,PositionTexture]]);
			Commands.push(['Draw',BlitGeo,UpdateVelocitysAndPositionsShader,Uniforms,State]);
		}
		else
		{
			Commands.push(['SetRenderTarget',VelocitysTexture]);
			Commands.push(['Draw',BlitGeo,UpdateVelocitysShader,Uniforms,State]);
		}
	}

	//	update positions texture
	if ( !UseMrt )
	{
		const UpdatePositionsShader = AssetManager.GetAsset(BlitUpdatePositionsShader,RenderContext);
		const Uniforms = {};
		Uniforms.OldPositionsTexture = PreviousPositionsTexture;
		Uniforms.VelocitysTexture = VelocitysTexture;
		Uniforms.TexelSize = TexelSize;
		Commands.push(['SetRenderTarget',PositionTexture]);
		Commands.push(['Draw',BlitGeo,UpdatePositionsShader,Uniforms,State]);
	}
	
	return Commands;
}


function GetBoundingBoxesFromOccupancy(OccupancyTexture)
{
	if ( !OccupancyTexture )
		return [];
	
	let BoundingBoxes = [];

	const w = OccupancyTexture.GetWidth();
	const h = OccupancyTexture.GetHeight();
	const Channels = OccupancyTexture.GetChannels();
	if ( Channels != 4 )
		throw `Expecting 4 channels in occupancy texture, not ${Channels}`;
	const Pixels = OccupancyTexture.GetPixelBuffer();

	let MapWorldSize = [
		OccupancyMapSize.WorldMax[0] - OccupancyMapSize.WorldMin[0],
		OccupancyMapSize.WorldMax[1] - OccupancyMapSize.WorldMin[1],
		OccupancyMapSize.WorldMax[2] - OccupancyMapSize.WorldMin[2],
	];
	const YSectionsPerComponent = 7;
	const YSectionComponents = 4;
	const YSectionCount = (YSectionsPerComponent*YSectionComponents);

	let MapPixelStep = [1/w,1/YSectionCount,1/h];
	MapPixelStep[0] *= MapWorldSize[0];
	MapPixelStep[1] *= MapWorldSize[1];
	MapPixelStep[2] *= MapWorldSize[2];
	
	function GetBoundingBox(px,py,YBit)
	{
		let u = px / w;
		let v = py / h;
		let yf = YBit / YSectionCount;
		let x = Lerp( OccupancyMapSize.WorldMin[0], OccupancyMapSize.WorldMax[0], u ); 
		let y = Lerp( OccupancyMapSize.WorldMin[1], OccupancyMapSize.WorldMax[1], yf ); 
		let z = Lerp( OccupancyMapSize.WorldMin[2], OccupancyMapSize.WorldMax[2], v );
		const Box = {};
		Box.Min = [x,y,z];
		Box.Size = MapPixelStep;
		//Box.Size = MapPixelStep.slice();
		//Box.Size[1] = 0.10;
		return Box;
	}
	
	//	precalc this pow as it's expensive
	const SectionValues = new Array(YSectionsPerComponent).fill(0).map( (nul,cs) => Math.pow(10,cs) );
		
	function DecodeRgbaToBoundingBoxes(px,py,rgba)
	{
		const Boxs = [];
		
		for ( let SectionComponent=0;	SectionComponent<YSectionComponents;	SectionComponent++ )
		{
			for ( let CompSection=0;	CompSection<YSectionsPerComponent;	CompSection++ )
			{
				//	old bitfield
				//const Set = YBitfield & (1<<b);
				//	new section'd x10
				//	b=0 is 1+1+1+1 etc
				//	b=1 is 10+10+10
				const YBitfield = rgba[SectionComponent];
				//let SectionValue = Math.pow(10,CompSection);
				const SectionValue = SectionValues[CompSection];
				let HitsInSection = Math.floor( YBitfield / SectionValue ) % 10;
				const Set = (HitsInSection>0);
				const SectionIndex = (SectionComponent*YSectionsPerComponent) + CompSection;
				const b = SectionIndex;
				
				if ( !Set )
					continue;
				
				const Box = GetBoundingBox(px,py,b);
				Boxs.push(Box);
			}
		}
		return Boxs;
	}
		
	
	for ( let i=0;	i<Pixels.length;	i+=Channels)
	{
		//const Rgba = Pixels.slice( i, i+Channels );
		const r = Pixels[i+0];
		const g = Pixels[i+1];
		const b = Pixels[i+2];
		const a = Pixels[i+3];
		const Rgba = [r,g,b,a];
		const pi = i / Channels;
		const x = pi % w;
		const y = Math.floor( pi / w );
		const Boxs = DecodeRgbaToBoundingBoxes( x, y, Rgba );
		BoundingBoxes.push(...Boxs);
	}

	BoundingBoxes = BoundingBoxes.filter( b => b!=null );

	return BoundingBoxes;
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

let BoundingBoxShader = null;
let CubeShader = null;
let CubeMultiViewShader = null;
let CubePhysicsShader = null;
let CubePhysicsMultiViewShader = null;
let AppCamera = new Camera_t();
//	try and emulate default XR pose a bit
AppCamera.Position = [0,1.5,0];
AppCamera.LookAt = [0,1.5,-1];
AppCamera.FovVertical = 90;
let DefaultDepthTexture = CreateRandomImage(16,16);
let VoxelCenterPosition = [0,0,AppCamera.LookAt[2]];//AppCamera.LookAt.slice();
let CubeSize = 0.02;





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
	//Uniforms.LocalToWorldTransform = CubeTransforms;
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
		
		this.VoxelBuffer = null;
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
		AssetManager.RegisterAssetAsyncFetchFunction('BlitQuad', CreateBlitTriangleBuffer );
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
			const VertFilename = 'Geo.vert.glsl';
			const FragFilename = 'BoundingBox.frag.glsl';
			BoundingBoxShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertFilename);
		}
		{
			const VertBlitQuadFilename = 'BlitQuad.vert.glsl';
			BlitCopyShader = AssetManager.RegisterShaderAssetFilename('BlitCopy.frag.glsl',VertBlitQuadFilename);
			BlitUpdatePositionsShader = AssetManager.RegisterShaderAssetFilename('BlitUpdatePositions.frag.glsl',VertBlitQuadFilename);
			BlitUpdateVelocitysShader = AssetManager.RegisterShaderAssetFilename('BlitUpdateVelocitys.frag.glsl',VertBlitQuadFilename);
			BlitUpdateVelocitysAndPositionsShader = AssetManager.RegisterShaderAssetFilename('BlitUpdateVelocitysAndPositions.frag.glsl',VertBlitQuadFilename);
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
		CameraUniforms.DepthTexture = Camera.DepthImage || DefaultDepthTexture;
		CameraUniforms.NormalDepthToViewDepthTransform = CameraUniforms.DepthTexture.NormalDepthToViewDepthTransform || [];
		
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

		if ( this.VoxelBuffer )
		{
			RenderVoxelBufferCubes( PushCommand, RenderContext, CameraUniforms, this.VoxelBuffer, null );
		}

		
		{
			//RenderVoxelBufferCubes( PushCommand, RenderContext, CameraUniforms, this.Game.VoxelBuffer, this.Game.OccupancyTexture );
		}
		
		//	floor cube
		if ( RenderFloor )
		{
			let FloorCubeScale = 0.01;
			let FloorCubeWidth = FloorSize;
			let FloorCubeHeight = CubeSize * 1.0 * FloorCubeScale;
			let FloorZ = -5;
			let FloorX = -3;
			FloorCubeHeight += CubeSize * 2.0;
			let FloorTransform = PopMath.CreateTranslationScaleMatrix( [FloorX,-FloorCubeHeight,FloorZ], [FloorCubeWidth,FloorCubeScale,FloorCubeWidth] );
			
			let Transforms = [FloorTransform];
			let Velocitys = [[0,0,0]];
			let Colours = [FloorColour];
			const OccupancyTexture = null;
			RenderCubes( PushCommand, RenderContext, CameraUniforms, Transforms, Velocitys, OccupancyTexture, Colours );
		}
		
		//	dont do this in xr
		if ( RenderDebugQuads )
		{
			const DebugTextures = [];
			if ( this.VoxelBuffer )
				DebugTextures.push( this.VoxelBuffer.PositionsTexture );
			
			function Render(DebugTexture,Index)
			{
				const DrawTransparent = false;
				RenderDebugQuad( PushCommand, RenderContext, DebugTexture, Index, DrawTransparent );
			}
			DebugTextures.forEach( Render );
		}

		if ( this.Octree )
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
		await this.GenerateSdfThread(`Models/Taxi.vox`);
	}
	
	//	this is a pipeline, this is the bit which we should abstract
	async GenerateSdfThread(Filename)
	{
		this.VoxelBuffer = await this.LoadVoxelBuffer(Filename);
		this.Octree = await this.GenerateOctreeFromVoxelBuffer(this.VoxelBuffer);
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
		
		const VoxelBuffer = new VoxelBuffer_t();
		VoxelBuffer.LoadPositions( Geometry.Positions, Geometry.Colours, VoxelCenterPosition, 0.0 );
		return VoxelBuffer;
	}
}
